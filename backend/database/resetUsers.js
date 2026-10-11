/**
 * Database User Reset Script
 * Cleans all users and seeds exactly 1 Admin, 1 Manager, 1 Driver, and 1 Student
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const hashPwd = (pwd) => bcrypt.hashSync(pwd, 10);

function resetUsers() {
  console.log('🔄 Starting user reset transaction...');

  db.exec('PRAGMA foreign_keys = OFF;');

  try {
    // 1. Clear dependent user reference tables
    db.exec('DELETE FROM feedback;');
    db.exec('DELETE FROM trips;');
    db.exec('DELETE FROM pickup_points;');
    db.exec('DELETE FROM geofence_violations;');
    db.exec('DELETE FROM activity_logs;');
    db.exec('DELETE FROM notifications;');

    // 2. Clear all user tables
    db.exec('DELETE FROM students;');
    db.exec('DELETE FROM drivers;');
    db.exec('DELETE FROM managers;');
    db.exec('DELETE FROM admins;');

    // 3. Reset autoincrement sequences
    try {
      db.exec(`
        DELETE FROM sqlite_sequence 
        WHERE name IN ('students', 'drivers', 'managers', 'admins', 'trips', 'feedback', 'pickup_points', 'geofence_violations', 'activity_logs', 'notifications');
      `);
    } catch (_) {}

    // 4. Seed exactly 1 Admin
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin@123';
    db.prepare(`
      INSERT INTO admins (admin_id, username, password, email, system_user_id, must_change_password)
      VALUES (1, ?, ?, 'admin@giet.edu', 'GIET-ADM-0001', 0)
    `).run(adminUser, hashPwd(adminPass));
    console.log('✅ 1 Admin seeded: admin@giet.edu (Username: admin, Password: ' + adminPass + ')');

    // 5. Seed exactly 1 Manager
    db.prepare(`
      INSERT INTO managers (manager_id, name, email, phone, password, system_user_id, must_change_password)
      VALUES (1, 'Rajesh Kumar', 'rajesh@giet.edu', '9876543210', ?, 'GIET-MGR-1001', 0)
    `).run(hashPwd('Manager@123'));
    console.log('✅ 1 Manager seeded: rajesh@giet.edu (Password: Manager@123)');

    // 6. Seed exactly 1 Driver
    db.prepare(`
      INSERT INTO drivers (driver_id, name, email, password, phone, license_number, address, is_active, system_user_id, must_change_password)
      VALUES (1, 'Rahul Verma', 'rahul.driver@giet.edu', ?, '9123456789', 'OD-05-12345', 'GIET Campus Road, Gunupur', 1, 'GIET-DRV-1001', 0)
    `).run(hashPwd('Driver@123'));
    console.log('✅ 1 Driver seeded: rahul.driver@giet.edu (Password: Driver@123)');

    // 7. Ensure routes exist
    const route = db.prepare('SELECT route_id FROM routes LIMIT 1').get();
    let routeId = route ? route.route_id : 1;
    if (!route) {
      const r = db.prepare(`
        INSERT INTO routes (route_name, source, destination, distance, direction, destination_type)
        VALUES ('Route A - GIET Campus to Gunupur Railway Station', 'GIET Main Gate', 'Gunupur Railway Station', 6.2, 'towards_campus', 'college')
      `).run();
      routeId = r.lastInsertRowid;
    }

    // 8. Link Buses: Bus 1 assigned to Driver 1 & Manager 1, other buses unassigned
    const bus1 = db.prepare('SELECT bus_id FROM buses WHERE bus_number = ?').get('BUS-001');
    let b1Id = bus1 ? bus1.bus_id : null;

    if (!bus1) {
      const bRes = db.prepare(`
        INSERT INTO buses (bus_number, registration_number, capacity, available_seats, driver_id, manager_id, route_id, current_latitude, current_longitude, status, tracking_status, trip_state)
        VALUES ('BUS-001', 'OD-05-AB-1234', 50, 48, 1, 1, ?, 19.0435, 83.8138, 'running', 'LIVE', 'IN_TRANSIT')
      `).run(routeId);
      b1Id = bRes.lastInsertRowid;
    } else {
      db.prepare(`
        UPDATE buses 
        SET driver_id = 1, manager_id = 1, route_id = ?, status = 'running', tracking_status = 'LIVE', trip_state = 'IN_TRANSIT'
        WHERE bus_id = ?
      `).run(routeId, b1Id);
    }

    // Set other buses to unassigned driver so only 1 driver exists and is assigned
    db.prepare(`UPDATE buses SET driver_id = NULL WHERE bus_id != ?`).run(b1Id);
    db.prepare(`UPDATE buses SET manager_id = 1 WHERE bus_id != ?`).run(b1Id);

    // 9. Seed exactly 1 Student
    db.prepare(`
      INSERT INTO students (student_id, roll_number, name, email, phone, department, semester, password, favorite_bus, system_user_id, must_change_password)
      VALUES (1, 'CS2021001', 'Arjun Mehta', 'arjun@giet.edu', '9000001111', 'Computer Science', 6, ?, ?, 'GIET-STU-1001', 0)
    `).run(hashPwd('Student@123'), b1Id);
    console.log('✅ 1 Student seeded: arjun@giet.edu (Password: Student@123)');

    // 10. Sample feedback & pickup points for Bus 1
    db.prepare(`
      INSERT INTO feedback (student_id, bus_id, message, rating)
      VALUES (1, ?, 'Bus is clean, on time, and tracking is very accurate!', 5)
    `).run(b1Id);

    db.prepare(`
      INSERT INTO pickup_points (route_id, bus_id, name, description, latitude, longitude, created_by_driver_id)
      VALUES (?, ?, 'Main Gate', 'GIET Campus Main Gate', 19.0435, 83.8138, 1)
    `).run(routeId, b1Id);

    db.prepare(`
      INSERT INTO notifications (title, message, receiver_type, is_emergency)
      VALUES ('System Ready', 'Welcome to GIET Smart Bus Tracker. System initialized with verified user credentials.', 'all', 0)
    `).run();

    console.log('🎉 Database successfully reset to 1 user of each type!');
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

if (require.main === module) {
  resetUsers();
}

module.exports = { resetUsers };
