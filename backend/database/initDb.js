/**
 * Database Initialization — Schema + Seed Data
 * Uses Node.js built-in node:sqlite (no native compilation needed)
 * Canonical schema including geofences, geofence_violations, pickup_points,
 * GIET University @giet.edu credentials, and RBAC tables.
 */
require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path   = require('path');
const fs     = require('fs');

function initDb(targetDb = null) {
  const shouldClose = !targetDb;
  let db = targetDb;

  if (!db) {
    const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bustrack.db');
    const DB_DIR  = path.dirname(DB_PATH);

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    db = new DatabaseSync(DB_PATH);
  }

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  console.log('🗄️  Ensuring database tables and seeds...');

// ─── SCHEMA ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    admin_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT NOT NULL UNIQUE,
    password             TEXT NOT NULL,
    email                TEXT,
    system_user_id       TEXT,
    must_change_password INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS managers (
    manager_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    phone                TEXT,
    password             TEXT NOT NULL,
    system_user_id       TEXT,
    must_change_password INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drivers (
    driver_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT NOT NULL,
    email                TEXT UNIQUE,
    password             TEXT,
    phone                TEXT,
    license_number       TEXT UNIQUE,
    address              TEXT,
    photo                TEXT,
    is_active            INTEGER DEFAULT 1,
    system_user_id       TEXT,
    must_change_password INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routes (
    route_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    route_name           TEXT NOT NULL,
    source               TEXT NOT NULL,
    destination          TEXT NOT NULL,
    distance             REAL,
    direction            TEXT DEFAULT 'towards_campus',
    destination_type     TEXT DEFAULT 'college',
    created_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bus_stops (
    stop_id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id                INTEGER NOT NULL,
    stop_name               TEXT NOT NULL,
    latitude                REAL NOT NULL,
    longitude               REAL NOT NULL,
    stop_order              INTEGER NOT NULL,
    is_college              INTEGER DEFAULT 0,
    expected_offset_minutes INTEGER DEFAULT 5,
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
    last_valid_latitude  REAL,
    last_valid_longitude REAL,
    last_gps_timestamp   TEXT,
    tracking_status      TEXT DEFAULT 'OFFLINE',
    trip_state           TEXT DEFAULT 'SCHEDULED',
    created_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (driver_id)  REFERENCES drivers(driver_id),
    FOREIGN KEY (manager_id) REFERENCES managers(manager_id),
    FOREIGN KEY (route_id)   REFERENCES routes(route_id)
  );

  CREATE TABLE IF NOT EXISTS students (
    student_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number          TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    phone                TEXT,
    department           TEXT,
    semester             INTEGER,
    password             TEXT NOT NULL,
    favorite_bus         INTEGER,
    profile_photo        TEXT,
    system_user_id       TEXT,
    must_change_password INTEGER DEFAULT 0,
    created_at           TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (favorite_bus) REFERENCES buses(bus_id)
  );

  CREATE TABLE IF NOT EXISTS trips (
    trip_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id           INTEGER NOT NULL,
    driver_id        INTEGER,
    route_id         INTEGER,
    start_time       TEXT,
    end_time         TEXT,
    gps_mode         TEXT DEFAULT 'SIMULATION',
    trip_state       TEXT DEFAULT 'SCHEDULED',
    violation_count  INTEGER DEFAULT 0,
    suspicious_count INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'scheduled'
                     CHECK(status IN ('scheduled','running','completed','cancelled')),
    created_at       TEXT DEFAULT (datetime('now')),
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

  CREATE TABLE IF NOT EXISTS geofences (
    geofence_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT NOT NULL,
    description          TEXT,
    coordinates          TEXT NOT NULL,
    is_active            INTEGER DEFAULT 1,
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS geofence_violations (
    violation_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id               INTEGER NOT NULL,
    driver_id            INTEGER,
    trip_id              INTEGER,
    geofence_id          INTEGER,
    latitude             REAL NOT NULL,
    longitude            REAL NOT NULL,
    last_valid_lat       REAL,
    last_valid_lng       REAL,
    timestamp            TEXT DEFAULT (datetime('now')),
    status               TEXT DEFAULT 'OUTSIDE_OPERATION_AREA',
    FOREIGN KEY (bus_id) REFERENCES buses(bus_id),
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id),
    FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
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

const hashPwd = (pwd) => bcrypt.hashSync(pwd, 10);

// ─── ADMIN SEED ─────────────────────────────────────────────────────────────
const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get()?.c || 0;
if (adminCount === 0) {
  const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  db.prepare(`
    INSERT INTO admins (username, password, email, system_user_id)
    VALUES (?, ?, ?, 'GIET-ADM-0001')
  `).run(defaultAdminUsername, hashPwd(defaultAdminPassword), 'admin@giet.edu');
  console.log('👑 Admin seeded: admin@giet.edu');
}

// ─── MANAGERS SEED ─────────────────────────────────────────────────────────
const managerCount = db.prepare('SELECT COUNT(*) as c FROM managers').get()?.c || 0;
if (managerCount === 0) {
  db.prepare(`
    INSERT INTO managers (name, email, phone, password, system_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Rajesh Kumar', 'rajesh@giet.edu', '9876543210', hashPwd('Manager@123'), 'GIET-MGR-1001');
  db.prepare(`
    INSERT INTO managers (name, email, phone, password, system_user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Priya Sharma', 'priya@giet.edu', '9876543211', hashPwd('Manager@123'), 'GIET-MGR-1002');
  console.log('👔 Managers seeded: rajesh@giet.edu, priya@giet.edu');
}

// ─── DRIVERS SEED ───────────────────────────────────────────────────────────
const driverCount = db.prepare('SELECT COUNT(*) as c FROM drivers').get()?.c || 0;
if (driverCount === 0) {
  db.prepare(`
    INSERT INTO drivers (name, email, password, phone, license_number, address, system_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('Rahul Verma', 'rahul.driver@giet.edu', hashPwd('Driver@123'), '9123456789', 'OD-05-12345', 'GIET Campus Road, Gunupur', 'GIET-DRV-1001');
  db.prepare(`
    INSERT INTO drivers (name, email, password, phone, license_number, address, system_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('Suresh Babu', 'suresh.driver@giet.edu', hashPwd('Driver@123'), '9123456790', 'OD-05-76543', 'College Square, Gunupur', 'GIET-DRV-1002');
  db.prepare(`
    INSERT INTO drivers (name, email, password, phone, license_number, address, system_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('Vijay Singh', 'vijay.driver@giet.edu', hashPwd('Driver@123'), '9123456791', 'OD-05-11223', 'Station Road, Gunupur', 'GIET-DRV-1003');
  console.log('🚌 Drivers seeded with @giet.edu');
}

// ─── ROUTES SEED ────────────────────────────────────────────────────────────
const routeCount = db.prepare('SELECT COUNT(*) as c FROM routes').get()?.c || 0;
let r1Id = 1, r2Id = 2;
if (routeCount === 0) {
  const r1 = db.prepare(`
    INSERT INTO routes (route_name, source, destination, distance, direction, destination_type)
    VALUES (?, ?, ?, ?, 'towards_campus', 'college')
  `).run('Route A - GIET Campus to Gunupur Railway Station', 'GIET Main Gate', 'Gunupur Railway Station', 6.2);
  r1Id = r1.lastInsertRowid;

  const r2 = db.prepare(`
    INSERT INTO routes (route_name, source, destination, distance, direction, destination_type)
    VALUES (?, ?, ?, ?, 'towards_campus', 'college')
  `).run('Route B - GIET Campus to City Market', 'GIET Library', 'Gunupur City Market', 5.5);
  r2Id = r2.lastInsertRowid;

  const stopStmt = db.prepare(`
    INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order, is_college, expected_offset_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const stops1 = [
    { name: 'GIET Main Gate',          lat: 19.0435, lng: 83.8138, order: 1, is_college: 1 },
    { name: 'Tech Block / CSE Dept',   lat: 19.0455, lng: 83.8150, order: 2, is_college: 1 },
    { name: 'Central Library Stop',    lat: 19.0470, lng: 83.8165, order: 3, is_college: 1 },
    { name: 'Boys Hostel Gate',        lat: 19.0490, lng: 83.8180, order: 4, is_college: 1 },
    { name: 'College Square Gunupur',  lat: 19.0620, lng: 83.8115, order: 5, is_college: 0 },
    { name: 'Gunupur Bus Stand',       lat: 19.0750, lng: 83.8110, order: 6, is_college: 0 },
    { name: 'Gunupur Railway Station', lat: 19.0820, lng: 83.8100, order: 7, is_college: 0 },
  ];
  stops1.forEach(s => stopStmt.run(r1Id, s.name, s.lat, s.lng, s.order, s.is_college, 5));

  const stops2 = [
    { name: 'GIET Campus Library',     lat: 19.0470, lng: 83.8165, order: 1, is_college: 1 },
    { name: 'Admin Block',             lat: 19.0445, lng: 83.8145, order: 2, is_college: 1 },
    { name: 'Girls Hostel Complex',    lat: 19.0425, lng: 83.8130, order: 3, is_college: 1 },
    { name: 'Stadium Road Junction',   lat: 19.0550, lng: 83.8125, order: 4, is_college: 0 },
    { name: 'Daily Market Square',     lat: 19.0710, lng: 83.8100, order: 5, is_college: 0 },
    { name: 'Gunupur City Market',     lat: 19.0780, lng: 83.8090, order: 6, is_college: 0 },
  ];
  stops2.forEach(s => stopStmt.run(r2Id, s.name, s.lat, s.lng, s.order, s.is_college, 5));
  console.log('🗺️ Routes and bus stops seeded');
}

// ─── BUSES SEED ─────────────────────────────────────────────────────────────
const busCount = db.prepare('SELECT COUNT(*) as c FROM buses').get()?.c || 0;
let b1Id = 1, b2Id = 2, b3Id = 3;
if (busCount === 0) {
  const d1 = db.prepare('SELECT driver_id FROM drivers LIMIT 1').get()?.driver_id || 1;
  const d2 = db.prepare('SELECT driver_id FROM drivers LIMIT 1 OFFSET 1').get()?.driver_id || d1;
  const d3 = db.prepare('SELECT driver_id FROM drivers LIMIT 1 OFFSET 2').get()?.driver_id || d1;
  const m1 = db.prepare('SELECT manager_id FROM managers LIMIT 1').get()?.manager_id || 1;
  const m2 = db.prepare('SELECT manager_id FROM managers LIMIT 1 OFFSET 1').get()?.manager_id || m1;

  const busStmt = db.prepare(`
    INSERT INTO buses (bus_number, registration_number, capacity, available_seats, driver_id, manager_id, route_id, current_latitude, current_longitude, status, tracking_status, trip_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // BUS-001 is active & running on Route A for live demonstration
  const b1 = busStmt.run('BUS-001', 'OD-05-AB-1234', 50, 32, d1, m1, r1Id, 19.0435, 83.8138, 'running', 'LIVE', 'IN_TRANSIT');
  b1Id = b1.lastInsertRowid;
  // BUS-002 is delayed on Route B
  const b2 = busStmt.run('BUS-002', 'OD-05-CD-5678', 40, 18, d2, m1, r2Id, 19.0470, 83.8165, 'delayed', 'LIVE', 'IN_TRANSIT');
  b2Id = b2.lastInsertRowid;
  // BUS-003 is parked/inactive at terminal with all 45 seats available
  const b3 = busStmt.run('BUS-003', 'OD-05-EF-9012', 45, 45, d3, m2, r1Id, 19.0490, 83.8180, 'inactive', 'OFFLINE', 'SCHEDULED');
  b3Id = b3.lastInsertRowid;

  // Pickup points for Route 1
  const ppStmt = db.prepare(`
    INSERT INTO pickup_points (route_id, bus_id, name, description, latitude, longitude, created_by_driver_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  ppStmt.run(r1Id, b1Id, 'Hostel Gate', 'GIET Boys Hostel Entrance', 19.0490, 83.8180, d1);
  ppStmt.run(r1Id, b1Id, 'Library',     'GIET Central Library Stop', 19.0470, 83.8165, d1);
  ppStmt.run(r1Id, b1Id, 'Main Gate',   'GIET Campus Main Gate', 19.0435, 83.8138, d1);
  console.log('🚌 Buses and pickup points seeded');
}

// ─── STUDENTS SEED ──────────────────────────────────────────────────────────
const studentCount = db.prepare('SELECT COUNT(*) as c FROM students').get()?.c || 0;
if (studentCount === 0) {
  const stuStmt = db.prepare(`
    INSERT INTO students (roll_number, name, email, phone, department, semester, password, favorite_bus, system_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stuStmt.run('CS2021001', 'Arjun Mehta',   'arjun@giet.edu',   '9000001111', 'Computer Science', 6, hashPwd('Student@123'), b1Id, 'GIET-STU-1001');
  stuStmt.run('EC2021002', 'Sneha Patel',   'sneha@giet.edu',   '9000002222', 'Electronics',      4, hashPwd('Student@123'), b2Id, 'GIET-STU-1002');
  stuStmt.run('ME2022003', 'Rahul Sharma',  'rahul.student@giet.edu', '9000003333', 'Mechanical', 3, hashPwd('Student@123'), b1Id, 'GIET-STU-1003');
  stuStmt.run('CE2022004', 'Ananya Singh',  'ananya@giet.edu',  '9000004444', 'Civil',            2, hashPwd('Student@123'), null, 'GIET-STU-1004');
  stuStmt.run('CS2023005', 'Karthik Reddy', 'karthik@giet.edu', '9000005555', 'Computer Science', 1, hashPwd('Student@123'), b3Id, 'GIET-STU-1005');
  console.log('🎓 Students seeded with @giet.edu');
}

// ─── GEOFENCE SEED ──────────────────────────────────────────────────────────
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

// ─── SAMPLE NOTIFICATIONS ───────────────────────────────────────────────────
const notifCount = db.prepare('SELECT COUNT(*) as c FROM notifications').get()?.c || 0;
if (notifCount === 0) {
  const notifStmt = db.prepare(`INSERT INTO notifications (title, message, receiver_type, is_emergency) VALUES (?, ?, ?, ?)`);
  notifStmt.run('Welcome to GIET Smart Bus Tracker', 'Track your university bus in real time across Gunupur.', 'all', 0);
  notifStmt.run('BUS-001 Live on Route A', 'BUS-001 is currently running on Route A towards campus.', 'all', 0);
}

  if (shouldClose) {
    db.close();
  }
  console.log('✅ Database initialization complete!');
  return db;
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb };
