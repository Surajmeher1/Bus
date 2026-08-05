require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'bustrack.db');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    phone           TEXT,
    license_number  TEXT UNIQUE,
    address         TEXT,
    photo           TEXT,
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
    current_latitude    REAL DEFAULT 0,
    current_longitude   REAL DEFAULT 0,
    current_speed       REAL DEFAULT 0,
    status              TEXT DEFAULT 'inactive'
                        CHECK(status IN ('running','delayed','maintenance','cancelled','inactive')),
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
    status      TEXT DEFAULT 'scheduled'
                CHECK(status IN ('scheduled','running','completed','cancelled')),
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bus_id)    REFERENCES buses(bus_id),
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id),
    FOREIGN KEY (route_id)  REFERENCES routes(route_id)
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

  // Managers
  const m1 = db.prepare(`INSERT INTO managers (name, email, phone, password) VALUES (?, ?, ?, ?)`)
    .run('Rajesh Kumar', 'rajesh@university.edu', '9876543210', hashPwd('Manager@123'));
  const m2 = db.prepare(`INSERT INTO managers (name, email, phone, password) VALUES (?, ?, ?, ?)`)
    .run('Priya Sharma', 'priya@university.edu', '9876543211', hashPwd('Manager@123'));

  // Drivers
  const d1 = db.prepare(`INSERT INTO drivers (name, phone, license_number, address) VALUES (?, ?, ?, ?)`)
    .run('Suresh Babu', '9123456789', 'KA-1234567', 'Koramangala, Bangalore');
  const d2 = db.prepare(`INSERT INTO drivers (name, phone, license_number, address) VALUES (?, ?, ?, ?)`)
    .run('Mohan Rao', '9123456790', 'KA-7654321', 'Indiranagar, Bangalore');
  const d3 = db.prepare(`INSERT INTO drivers (name, phone, license_number, address) VALUES (?, ?, ?, ?)`)
    .run('Vijay Singh', '9123456791', 'KA-1122334', 'Whitefield, Bangalore');

  // Routes
  const r1 = db.prepare(`INSERT INTO routes (route_name, source, destination, distance) VALUES (?, ?, ?, ?)`)
    .run('Route A - Main Campus to City Center', 'Main Campus Gate', 'City Bus Stand', 12.5);
  const r2 = db.prepare(`INSERT INTO routes (route_name, source, destination, distance) VALUES (?, ?, ?, ?)`)
    .run('Route B - Campus to Railway Station', 'University Library', 'Central Railway Station', 8.3);

  // Bus Stops for Route 1 (Bangalore area coordinates)
  const stops1 = [
    { name: 'Main Campus Gate',    lat: 12.9716, lng: 77.5946, order: 1 },
    { name: 'Tech Block',          lat: 12.9726, lng: 77.5956, order: 2 },
    { name: 'Sports Complex',      lat: 12.9740, lng: 77.5970, order: 3 },
    { name: 'Koramangala Junction',lat: 12.9352, lng: 77.6245, order: 4 },
    { name: 'BTM Layout',          lat: 12.9166, lng: 77.6101, order: 5 },
    { name: 'Lalbagh Gate',        lat: 12.9507, lng: 77.5848, order: 6 },
    { name: 'City Bus Stand',      lat: 12.9772, lng: 77.5773, order: 7 },
  ];
  const stopStmt1 = db.prepare(`INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES (?, ?, ?, ?, ?)`);
  stops1.forEach(s => stopStmt1.run(r1.lastInsertRowid, s.name, s.lat, s.lng, s.order));

  // Bus Stops for Route 2
  const stops2 = [
    { name: 'University Library',      lat: 12.9720, lng: 77.5940, order: 1 },
    { name: 'Admin Block',             lat: 12.9730, lng: 77.5950, order: 2 },
    { name: 'Hostel Complex',          lat: 12.9745, lng: 77.5965, order: 3 },
    { name: 'Jayanagar 4th Block',     lat: 12.9250, lng: 77.5938, order: 4 },
    { name: 'Majestic Bus Stand',      lat: 12.9766, lng: 77.5713, order: 5 },
    { name: 'Central Railway Station', lat: 12.9770, lng: 77.5700, order: 6 },
  ];
  const stopStmt2 = db.prepare(`INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES (?, ?, ?, ?, ?)`);
  stops2.forEach(s => stopStmt2.run(r2.lastInsertRowid, s.name, s.lat, s.lng, s.order));

  // Buses
  const busStmt = db.prepare(`
    INSERT INTO buses (bus_number, registration_number, capacity, available_seats, driver_id, manager_id, route_id, current_latitude, current_longitude, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const b1 = busStmt.run('BUS-001', 'KA-01-AB-1234', 50, 32, d1.lastInsertRowid, m1.lastInsertRowid, r1.lastInsertRowid, 12.9716, 77.5946, 'running');
  const b2 = busStmt.run('BUS-002', 'KA-01-CD-5678', 40, 18, d2.lastInsertRowid, m1.lastInsertRowid, r2.lastInsertRowid, 12.9720, 77.5940, 'running');
  const b3 = busStmt.run('BUS-003', 'KA-01-EF-9012', 45, 45, d3.lastInsertRowid, m2.lastInsertRowid, r1.lastInsertRowid, 12.9740, 77.5970, 'delayed');

  // Students
  const stuStmt = db.prepare(`
    INSERT INTO students (roll_number, name, email, phone, department, semester, password, favorite_bus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stuStmt.run('CS2021001', 'Arjun Mehta',    'arjun@student.edu', '9000001111', 'Computer Science', 6, hashPwd('Student@123'), b1.lastInsertRowid);
  stuStmt.run('EC2021002', 'Sneha Patel',    'sneha@student.edu', '9000002222', 'Electronics',      4, hashPwd('Student@123'), b2.lastInsertRowid);
  stuStmt.run('ME2022003', 'Rahul Verma',    'rahul@student.edu', '9000003333', 'Mechanical',       3, hashPwd('Student@123'), b1.lastInsertRowid);
  stuStmt.run('CE2022004', 'Ananya Singh',   'ananya@student.edu','9000004444', 'Civil',            2, hashPwd('Student@123'), null);
  stuStmt.run('CS2023005', 'Karthik Reddy',  'karthik@student.edu','9000005555','Computer Science', 1, hashPwd('Student@123'), b3.lastInsertRowid);

  // Active Trips
  const tripStmt = db.prepare(`INSERT INTO trips (bus_id, driver_id, route_id, start_time, status) VALUES (?, ?, ?, datetime('now'), ?)`);
  tripStmt.run(b1.lastInsertRowid, d1.lastInsertRowid, r1.lastInsertRowid, 'running');
  tripStmt.run(b2.lastInsertRowid, d2.lastInsertRowid, r2.lastInsertRowid, 'running');

  // Sample Notifications
  const notifStmt = db.prepare(`INSERT INTO notifications (title, message, receiver_type, is_emergency) VALUES (?, ?, ?, ?)`);
  notifStmt.run('Welcome to Smart Bus Tracker', 'Track your university bus in real time!', 'all', 0);
  notifStmt.run('BUS-001 Delay Alert', 'BUS-001 is running 10 minutes late due to traffic.', 'all', 0);
  notifStmt.run('New Route Added', 'Route B to Railway Station is now available.', 'all', 0);

  // Sample Feedback
  const fbStmt = db.prepare(`INSERT INTO feedback (student_id, bus_id, message, rating) VALUES (?, ?, ?, ?)`);
  fbStmt.run(1, b1.lastInsertRowid, 'Bus was on time and comfortable. Great service!', 5);
  fbStmt.run(2, b2.lastInsertRowid, 'Driver was helpful but bus was a bit crowded.', 3);

  // Sample Fuel Records
  const fuelStmt = db.prepare(`INSERT INTO fuel_records (bus_id, date, liters, cost, odometer) VALUES (?, date('now'), ?, ?, ?)`);
  fuelStmt.run(b1.lastInsertRowid, 45.0, 3600, 12500);
  fuelStmt.run(b2.lastInsertRowid, 38.5, 3080, 8900);

  console.log('✅ Seed data inserted successfully');
  console.log('\n📋 Default Credentials:');
  console.log('   Admin     → username: admin       | password: Admin@123');
  console.log('   Manager 1 → email: rajesh@university.edu | password: Manager@123');
  console.log('   Manager 2 → email: priya@university.edu  | password: Manager@123');
  console.log('   Student 1 → email: arjun@student.edu     | password: Student@123');
  console.log('   Student 2 → email: sneha@student.edu     | password: Student@123\n');
} else {
  console.log('ℹ️  Database already seeded, skipping...');
}

db.close();
console.log('✅ Database initialization complete!');
