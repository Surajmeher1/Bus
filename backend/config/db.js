/**
 * Database connection using Node.js built-in sqlite (node:sqlite)
 * Runs safe schema migrations on every startup.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_DIR  = path.join(__dirname, '../database');
const DB_PATH = path.join(DB_DIR, 'bustrack.db');

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

console.log('✅ Database migrations applied');

module.exports = db;
