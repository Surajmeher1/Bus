/**
 * Database Initialization — Schema + Seed Data
 * Uses Node.js built-in node:sqlite (no native compilation needed)
 * Review 1: Added driver auth, pickup_points table.
 */
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path   = require('path');
const fs     = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bustrack.db');
const DB_DIR  = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

console.log('🗄️  Initializing database...');

// ─── SCHEMA ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    admin_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    email       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS managers (
    manager_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    phone       TEXT,
    password    TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drivers (
    driver_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    email           TEXT UNIQUE,
    password        TEXT,
    phone           TEXT,
    license_number  TEXT UNIQUE,
    address         TEXT,
    photo           TEXT,
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routes (
    route_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    route_name  TEXT NOT NULL,
    source      TEXT NOT NULL,
    destination TEXT NOT NULL,
    distance    REAL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bus_stops (
    stop_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id    INTEGER NOT NULL,
    stop_name   TEXT NOT NULL,
    latitude    REAL NOT NULL,
    longitude   REAL NOT NULL,
    stop_order  INTEGER NOT NULL,
    FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS buses (
    bus_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_number          TEXT NOT NULL UNIQUE,
    registration_number TEXT NOT NULL UNIQUE,
    capacity            INTEGER NOT NULL DEFAULT 50,
    available_seats     INTEGER NOT NULL DEFAULT 50,
    driver_id           INTEGER,
    manager_id          INTEGER,
    route_id            INTEGER,
    active_trip_id      INTEGER,
    current_latitude    REAL DEFAULT 0,
    current_longitude   REAL DEFAULT 0,
    current_speed       REAL DEFAULT 0,
    status              TEXT DEFAULT 'inactive'
                        CHECK(status IN ('running','delayed','maintenance','cancelled','inactive','offline')),
    created_at          TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (driver_id)  REFERENCES drivers(driver_id),
    FOREIGN KEY (manager_id) REFERENCES managers(manager_id),
    FOREIGN KEY (route_id)   REFERENCES routes(route_id)
  );

  CREATE TABLE IF NOT EXISTS students (
    student_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number   TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    phone         TEXT,
    department    TEXT,
    semester      INTEGER,
    password      TEXT NOT NULL,
    favorite_bus  INTEGER,
    profile_photo TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (favorite_bus) REFERENCES buses(bus_id)
  );

  CREATE TABLE IF NOT EXISTS trips (
    trip_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id      INTEGER NOT NULL,
    driver_id   INTEGER,
    route_id    INTEGER,
    start_time  TEXT,
    end_time    TEXT,
    gps_mode    TEXT DEFAULT 'SIMULATION',
    status      TEXT DEFAULT 'scheduled'
                CHECK(status IN ('scheduled','running','completed','cancelled')),
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bus_id)    REFERENCES buses(bus_id),
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id),
    FOREIGN KEY (route_id)  REFERENCES routes(route_id)
  );

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
  );

  CREATE TABLE IF NOT EXISTS notifications (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    receiver_type   TEXT DEFAULT 'all'
                    CHECK(receiver_type IN ('all','student','manager','bus')),
    receiver_id     INTEGER,
    sent_by_type    TEXT,
    sent_by_id      INTEGER,
    is_emergency    INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    bus_id      INTEGER NOT NULL,
    message     TEXT,
    rating      INTEGER CHECK(rating BETWEEN 1 AND 5),
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    FOREIGN KEY (bus_id)     REFERENCES buses(bus_id)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    log_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_type   TEXT,
    user_id     INTEGER,
    action      TEXT NOT NULL,
    details     TEXT,
    ip_address  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fuel_records (
    record_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id      INTEGER NOT NULL,
    date        TEXT NOT NULL,
    liters      REAL NOT NULL,
    cost        REAL NOT NULL,
    odometer    REAL,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bus_id) REFERENCES buses(bus_id)
  );

  CREATE TABLE IF NOT EXISTS maintenance_records (
    record_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id      INTEGER NOT NULL,
    date        TEXT NOT NULL,
    description TEXT NOT NULL,
    cost        REAL,
    mechanic    TEXT,
    status      TEXT DEFAULT 'completed',
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bus_id) REFERENCES buses(bus_id)
  );
`);

console.log('✅ Tables created successfully');

// ─── SEED DATA ───────────────────────────────────────────────────────────────

const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
if (adminCount === 0) {
  console.log('🌱 Seeding initial data...');

  const hashPwd = (pwd) => bcrypt.hashSync(pwd, 10);

  // Admin
  db.prepare(`INSERT INTO admins (username, password, email) VALUES (?, ?, ?)`)
    .run('admin', hashPwd('Admin@123'), 'admin@university.edu');

  // Managers (kept for backward compatibility)
  const m1 = db.prepare(`INSERT INTO managers (name, email, phone, password) VALUES (?, ?, ?, ?)`)
    .run('Rajesh Kumar', 'rajesh@university.edu', '9876543210', hashPwd('Manager@123'));
  const m2 = db.prepare(`INSERT INTO managers (name, email, phone, password) VALUES (?, ?, ?, ?)`)
    .run('Priya Sharma', 'priya@university.edu', '9876543211', hashPwd('Manager@123'));

  // Drivers — now with email + password for login (Review 1)
  const d1 = db.prepare(`INSERT INTO drivers (name, email, password, phone, license_number, address) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('Rahul Verma', 'rahul@driver.edu', hashPwd('Driver@123'), '9123456789', 'OD-05-12345', 'GIET Campus Road, Gunupur');
  const d2 = db.prepare(`INSERT INTO drivers (name, email, password, phone, license_number, address) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('Suresh Babu', 'suresh@driver.edu', hashPwd('Driver@123'), '9123456790', 'OD-05-76543', 'College Square, Gunupur');
  const d3 = db.prepare(`INSERT INTO drivers (name, email, password, phone, license_number, address) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('Vijay Singh', 'vijay@driver.edu', hashPwd('Driver@123'), '9123456791', 'OD-05-11223', 'Station Road, Gunupur');

  // Routes (Gunupur, Odisha)
  const r1 = db.prepare(`INSERT INTO routes (route_name, source, destination, distance) VALUES (?, ?, ?, ?)`)
    .run('Route A - GIET Campus to Gunupur Railway Station', 'GIET Main Gate', 'Gunupur Railway Station', 6.2);
  const r2 = db.prepare(`INSERT INTO routes (route_name, source, destination, distance) VALUES (?, ?, ?, ?)`)
    .run('Route B - GIET Campus to City Market', 'GIET Library', 'Gunupur City Market', 5.5);

  // Bus Stops for Route 1 (Gunupur)
  const stops1 = [
    { name: 'GIET Main Gate',           lat: 19.0435, lng: 83.8138, order: 1 },
    { name: 'Tech Block / CSE Dept',    lat: 19.0455, lng: 83.8150, order: 2 },
    { name: 'Central Library Stop',     lat: 19.0470, lng: 83.8165, order: 3 },
    { name: 'Boys Hostel Gate',          lat: 19.0490, lng: 83.8180, order: 4 },
    { name: 'College Square Gunupur',   lat: 19.0620, lng: 83.8115, order: 5 },
    { name: 'Gunupur Bus Stand',        lat: 19.0750, lng: 83.8110, order: 6 },
    { name: 'Gunupur Railway Station',  lat: 19.0820, lng: 83.8100, order: 7 },
  ];
  const stopStmt1 = db.prepare(`INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES (?, ?, ?, ?, ?)`);
  stops1.forEach(s => stopStmt1.run(r1.lastInsertRowid, s.name, s.lat, s.lng, s.order));

  // Bus Stops for Route 2 (Gunupur)
  const stops2 = [
    { name: 'GIET Campus Library',      lat: 19.0470, lng: 83.8165, order: 1 },
    { name: 'Admin Block',             lat: 19.0445, lng: 83.8145, order: 2 },
    { name: 'Girls Hostel Complex',    lat: 19.0425, lng: 83.8130, order: 3 },
    { name: 'Stadium Road Junction',   lat: 19.0550, lng: 83.8125, order: 4 },
    { name: 'Daily Market Square',      lat: 19.0710, lng: 83.8100, order: 5 },
    { name: 'Gunupur City Market',      lat: 19.0780, lng: 83.8090, order: 6 },
  ];
  const stopStmt2 = db.prepare(`INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES (?, ?, ?, ?, ?)`);
  stops2.forEach(s => stopStmt2.run(r2.lastInsertRowid, s.name, s.lat, s.lng, s.order));

  // Buses — assigned to drivers (Gunupur)
  const busStmt = db.prepare(`
    INSERT INTO buses (bus_number, registration_number, capacity, available_seats, driver_id, manager_id, route_id, current_latitude, current_longitude, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const b1 = busStmt.run('BUS-001', 'OD-05-AB-1234', 50, 32, d1.lastInsertRowid, m1.lastInsertRowid, r1.lastInsertRowid, 19.0435, 83.8138, 'inactive');
  const b2 = busStmt.run('BUS-002', 'OD-05-CD-5678', 40, 18, d2.lastInsertRowid, m1.lastInsertRowid, r2.lastInsertRowid, 19.0470, 83.8165, 'inactive');
  const b3 = busStmt.run('BUS-003', 'OD-05-EF-9012', 45, 45, d3.lastInsertRowid, m2.lastInsertRowid, r1.lastInsertRowid, 19.0490, 83.8180, 'inactive');

  // Pickup points for Route 1 (Gunupur)
  const ppStmt = db.prepare(`INSERT INTO pickup_points (route_id, bus_id, name, description, latitude, longitude, created_by_driver_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  ppStmt.run(r1.lastInsertRowid, b1.lastInsertRowid, 'Hostel Gate', 'GIET Boys Hostel Entrance', 19.0490, 83.8180, d1.lastInsertRowid);
  ppStmt.run(r1.lastInsertRowid, b1.lastInsertRowid, 'Library',     'GIET Central Library Stop', 19.0470, 83.8165, d1.lastInsertRowid);
  ppStmt.run(r1.lastInsertRowid, b1.lastInsertRowid, 'Main Gate',   'GIET Campus Main Gate', 19.0435, 83.8138, d1.lastInsertRowid);

  // Students
  const stuStmt = db.prepare(`
    INSERT INTO students (roll_number, name, email, phone, department, semester, password, favorite_bus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stuStmt.run('CS2021001', 'Arjun Mehta',    'arjun@student.edu',   '9000001111', 'Computer Science', 6, hashPwd('Student@123'), b1.lastInsertRowid);
  stuStmt.run('EC2021002', 'Sneha Patel',    'sneha@student.edu',   '9000002222', 'Electronics',      4, hashPwd('Student@123'), b2.lastInsertRowid);
  stuStmt.run('ME2022003', 'Rahul Verma',    'rahul@student.edu',   '9000003333', 'Mechanical',       3, hashPwd('Student@123'), b1.lastInsertRowid);
  stuStmt.run('CE2022004', 'Ananya Singh',   'ananya@student.edu',  '9000004444', 'Civil',            2, hashPwd('Student@123'), null);
  stuStmt.run('CS2023005', 'Karthik Reddy',  'karthik@student.edu', '9000005555', 'Computer Science', 1, hashPwd('Student@123'), b3.lastInsertRowid);

  // Sample Notifications
  const notifStmt = db.prepare(`INSERT INTO notifications (title, message, receiver_type, is_emergency) VALUES (?, ?, ?, ?)`);
  notifStmt.run('Welcome to Smart Bus Tracker', 'Track your university bus in real time!', 'all', 0);
  notifStmt.run('BUS-001 Now Live', 'Driver Rahul has started the trip. BUS-001 is live.', 'all', 0);

  console.log('✅ Seed data inserted successfully');
  console.log('\n📋 Default Credentials:');
  console.log('   Admin     → username: admin              | password: Admin@123');
  console.log('   Driver 1  → email: rahul@driver.edu      | password: Driver@123  ← NEW');
  console.log('   Driver 2  → email: suresh@driver.edu     | password: Driver@123  ← NEW');
  console.log('   Driver 3  → email: vijay@driver.edu      | password: Driver@123  ← NEW');
  console.log('   Manager 1 → email: rajesh@university.edu | password: Manager@123');
  console.log('   Student 1 → email: arjun@student.edu     | password: Student@123');
  console.log('   Student 2 → email: sneha@student.edu     | password: Student@123\n');
} else {
  console.log('ℹ️  Database already seeded, skipping...');
}

db.close();
console.log('✅ Database initialization complete!');
