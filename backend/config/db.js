/**
 * Database connection using Node.js built-in sqlite (node:sqlite)
 * Runs safe schema migrations on every startup.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/bustrack.db');
const DB_DIR  = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db;
try {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  console.log('✅ SQLite database connected:', DB_PATH);
} catch (err) {
  console.error('❌ Database connection failed:', err.message);
  process.exit(1);
}

// ── Safe Runtime Migrations ────────────────────────────────────────────────────
// These are idempotent — they only add new columns/tables if they don't exist.
const runMigration = (sql, desc) => {
  try {
    db.exec(sql);
  } catch (e) {
    // Column already exists or similar — safe to ignore
    if (!e.message.includes('duplicate column') && !e.message.includes('already exists')) {
      console.warn(`⚠️  Migration warning [${desc}]:`, e.message);
    }
  }
};

// Add driver auth columns (Review 1)
runMigration(`ALTER TABLE drivers ADD COLUMN email TEXT`, 'drivers.email');
runMigration(`ALTER TABLE drivers ADD COLUMN password TEXT`, 'drivers.password');
runMigration(`ALTER TABLE drivers ADD COLUMN is_active INTEGER DEFAULT 1`, 'drivers.is_active');

// Add active_trip_id to buses (quick lookup of live trip)
runMigration(`ALTER TABLE buses ADD COLUMN active_trip_id INTEGER`, 'buses.active_trip_id');

// Add gps_mode column to trips (LIVE | SIMULATION)
runMigration(`ALTER TABLE trips ADD COLUMN gps_mode TEXT DEFAULT 'SIMULATION'`, 'trips.gps_mode');

// Pickup points — student-catchable named stops added by drivers during a trip
runMigration(`
  CREATE TABLE IF NOT EXISTS pickup_points (
    pickup_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id             INTEGER,
    trip_id              INTEGER,
    bus_id               INTEGER,
    name                 TEXT NOT NULL,
    description          TEXT,
    latitude             REAL NOT NULL,
    longitude            REAL NOT NULL,
    created_by_driver_id INTEGER,
    created_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (route_id) REFERENCES routes(route_id),
    FOREIGN KEY (bus_id)   REFERENCES buses(bus_id)
  )
`, 'pickup_points table');

// ── GIET Controls & User Management Migrations ─────────────────────────────────
// System user ID and temporary password change enforcement
runMigration(`ALTER TABLE students ADD COLUMN system_user_id TEXT`, 'students.system_user_id');
runMigration(`ALTER TABLE students ADD COLUMN must_change_password INTEGER DEFAULT 0`, 'students.must_change_password');

runMigration(`ALTER TABLE drivers ADD COLUMN system_user_id TEXT`, 'drivers.system_user_id');
runMigration(`ALTER TABLE drivers ADD COLUMN must_change_password INTEGER DEFAULT 0`, 'drivers.must_change_password');

runMigration(`ALTER TABLE managers ADD COLUMN system_user_id TEXT`, 'managers.system_user_id');
runMigration(`ALTER TABLE managers ADD COLUMN must_change_password INTEGER DEFAULT 0`, 'managers.must_change_password');

runMigration(`ALTER TABLE admins ADD COLUMN system_user_id TEXT`, 'admins.system_user_id');
runMigration(`ALTER TABLE admins ADD COLUMN must_change_password INTEGER DEFAULT 0`, 'admins.must_change_password');

// Route enhancements (college destination, direction)
runMigration(`ALTER TABLE routes ADD COLUMN direction TEXT DEFAULT 'towards_campus'`, 'routes.direction');
runMigration(`ALTER TABLE routes ADD COLUMN destination_type TEXT DEFAULT 'college'`, 'routes.destination_type');

// Bus stops enhancements (college stop flag, expected offset minutes)
runMigration(`ALTER TABLE bus_stops ADD COLUMN is_college INTEGER DEFAULT 0`, 'bus_stops.is_college');
runMigration(`ALTER TABLE bus_stops ADD COLUMN expected_offset_minutes INTEGER DEFAULT 5`, 'bus_stops.expected_offset_minutes');

// Bus anti-fake tracking status and location audit
runMigration(`ALTER TABLE buses ADD COLUMN last_valid_latitude REAL`, 'buses.last_valid_latitude');
runMigration(`ALTER TABLE buses ADD COLUMN last_valid_longitude REAL`, 'buses.last_valid_longitude');
runMigration(`ALTER TABLE buses ADD COLUMN last_gps_timestamp TEXT`, 'buses.last_gps_timestamp');
runMigration(`ALTER TABLE buses ADD COLUMN tracking_status TEXT DEFAULT 'OFFLINE'`, 'buses.tracking_status');
runMigration(`ALTER TABLE buses ADD COLUMN trip_state TEXT DEFAULT 'SCHEDULED'`, 'buses.trip_state');

// Trips tracking state & violation count
runMigration(`ALTER TABLE trips ADD COLUMN trip_state TEXT DEFAULT 'SCHEDULED'`, 'trips.trip_state');
runMigration(`ALTER TABLE trips ADD COLUMN violation_count INTEGER DEFAULT 0`, 'trips.violation_count');
runMigration(`ALTER TABLE trips ADD COLUMN suspicious_count INTEGER DEFAULT 0`, 'trips.suspicious_count');

// Geofence / Bus Operating Areas table
runMigration(`
  CREATE TABLE IF NOT EXISTS geofences (
    geofence_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    coordinates   TEXT NOT NULL,
    is_active     INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  )
`, 'geofences table');

// Geofence Violations audit table
runMigration(`
  CREATE TABLE IF NOT EXISTS geofence_violations (
    violation_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id            INTEGER NOT NULL,
    driver_id         INTEGER,
    trip_id           INTEGER,
    geofence_id       INTEGER,
    latitude          REAL NOT NULL,
    longitude         REAL NOT NULL,
    last_valid_lat    REAL,
    last_valid_lng    REAL,
    timestamp         TEXT DEFAULT (datetime('now')),
    status            TEXT DEFAULT 'OUTSIDE_OPERATION_AREA',
    FOREIGN KEY (bus_id) REFERENCES buses(bus_id),
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id),
    FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
  )
`, 'geofence_violations table');

// Performance Indexes
runMigration(`CREATE INDEX IF NOT EXISTS idx_trips_bus ON trips(bus_id, status);`, 'idx_trips_bus');
runMigration(`CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id, status);`, 'idx_trips_driver');
runMigration(`CREATE INDEX IF NOT EXISTS idx_buses_driver ON buses(driver_id);`, 'idx_buses_driver');
runMigration(`CREATE INDEX IF NOT EXISTS idx_buses_route ON buses(route_id);`, 'idx_buses_route');
runMigration(`CREATE INDEX IF NOT EXISTS idx_bus_stops_route ON bus_stops(route_id, stop_order);`, 'idx_bus_stops_route');
runMigration(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);`, 'idx_activity_logs_created');

// Seed default GIET University operating area geofence if none exists
try {
  const geofenceCount = db.prepare('SELECT COUNT(*) as c FROM geofences').get()?.c || 0;
  if (geofenceCount === 0) {
    const defaultCoords = JSON.stringify([
      [19.0300, 83.8000],
      [19.0950, 83.7950],
      [19.1000, 83.8300],
      [19.0300, 83.8350]
    ]);
    db.prepare(`
      INSERT INTO geofences (name, description, coordinates, is_active)
      VALUES (?, ?, ?, 1)
    `).run('GIET Campus & Gunupur Municipal Area', 'Approved operating polygon enclosing GIET University, main stops, bus stands, and railway station.', defaultCoords);
    console.log('📍 Default GIET University Operating Area geofence seeded');
  }
} catch (e) {
  console.warn('⚠️  Could not seed default geofence:', e.message);
}

// Mark first stops or stops named with 'Gate' / 'Campus' / 'College' as college stop if not already
try {
  db.prepare(`
    UPDATE bus_stops
    SET is_college = 1
    WHERE stop_name LIKE '%GIET%' OR stop_name LIKE '%Campus%' OR stop_name LIKE '%College%'
  `).run();
} catch (_) {}

console.log('✅ Database migrations applied');

module.exports = db;
