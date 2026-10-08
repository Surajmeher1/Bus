/**
 * PostgreSQL Database Initialization & Migration Tool
 * Runs when deploying to PostgreSQL environments (Supabase, Neon, Render Postgres, etc.)
 * Usage: node database/initDb.pg.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ Error: DATABASE_URL environment variable is required to initialize PostgreSQL.');
  console.log('   Example: DATABASE_URL=postgresql://user:password@hostname:5432/dbname?sslmode=require');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initPostgres() {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to PostgreSQL database.');
    console.log('📄 Executing schema.postgres.sql...');

    const schemaPath = path.join(__dirname, 'schema.postgres.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ PostgreSQL tables and indexes created successfully.');

    // Check if initial admin exists
    const adminRes = await client.query('SELECT COUNT(*) as count FROM admins');
    const adminCount = parseInt(adminRes.rows[0].count, 10);

    if (adminCount === 0) {
      console.log('🌱 Seeding initial PostgreSQL data...');
      const hashPwd = (pwd) => bcrypt.hashSync(pwd, 10);

      // Admin
      await client.query(
        'INSERT INTO admins (username, password, email) VALUES ($1, $2, $3)',
        ['admin', hashPwd('Admin@123'), 'admin@university.edu']
      );

      // Managers
      const m1 = await client.query(
        'INSERT INTO managers (name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING manager_id',
        ['Rajesh Kumar', 'rajesh@university.edu', '9876543210', hashPwd('Manager@123')]
      );
      const m2 = await client.query(
        'INSERT INTO managers (name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING manager_id',
        ['Priya Sharma', 'priya@university.edu', '9876543211', hashPwd('Manager@123')]
      );

      // Drivers
      const d1 = await client.query(
        'INSERT INTO drivers (name, email, password, phone, license_number, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING driver_id',
        ['Rahul Verma', 'rahul@driver.edu', hashPwd('Driver@123'), '9123456789', 'OD-05-12345', 'GIET Campus Road, Gunupur']
      );
      const d2 = await client.query(
        'INSERT INTO drivers (name, email, password, phone, license_number, address) VALUES ($1, $2, $3, $4, $5, $6) RETURNING driver_id',
        ['Suresh Babu', 'suresh@driver.edu', hashPwd('Driver@123'), '9123456790', 'OD-05-76543', 'College Square, Gunupur']
      );

      // Routes
      const r1 = await client.query(
        'INSERT INTO routes (route_name, source, destination, distance) VALUES ($1, $2, $3, $4) RETURNING route_id',
        ['Route A - GIET Campus to Gunupur Railway Station', 'GIET Main Gate', 'Gunupur Railway Station', 6.2]
      );
      const r2 = await client.query(
        'INSERT INTO routes (route_name, source, destination, distance) VALUES ($1, $2, $3, $4) RETURNING route_id',
        ['Route B - GIET Campus to City Market', 'GIET Library', 'Gunupur City Market', 5.5]
      );

      const route1Id = r1.rows[0].route_id;
      const route2Id = r2.rows[0].route_id;

      // Stops
      const stops1 = [
        ['GIET Main Gate', 19.0435, 83.8138, 1],
        ['Tech Block / CSE Dept', 19.0455, 83.8150, 2],
        ['Central Library Stop', 19.0470, 83.8165, 3],
        ['Boys Hostel Gate', 19.0490, 83.8180, 4],
        ['College Square Gunupur', 19.0620, 83.8115, 5],
        ['Gunupur Bus Stand', 19.0750, 83.8110, 6],
        ['Gunupur Railway Station', 19.0820, 83.8100, 7]
      ];
      for (const s of stops1) {
        await client.query(
          'INSERT INTO bus_stops (route_id, stop_name, latitude, longitude, stop_order) VALUES ($1, $2, $3, $4, $5)',
          [route1Id, s[0], s[1], s[2], s[3]]
        );
      }

      // Buses
      const b1 = await client.query(
        'INSERT INTO buses (bus_number, registration_number, capacity, available_seats, driver_id, manager_id, route_id, current_latitude, current_longitude, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING bus_id',
        ['BUS-001', 'OD-05-AB-1234', 50, 32, d1.rows[0].driver_id, m1.rows[0].manager_id, route1Id, 19.0435, 83.8138, 'inactive']
      );

      // Students
      await client.query(
        'INSERT INTO students (roll_number, name, email, phone, department, semester, password, favorite_bus) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['CS2021001', 'Arjun Mehta', 'arjun@student.edu', '9000001111', 'Computer Science', 6, hashPwd('Student@123'), b1.rows[0].bus_id]
      );
      await client.query(
        'INSERT INTO students (roll_number, name, email, phone, department, semester, password, favorite_bus) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['EC2021002', 'Sneha Patel', 'sneha@student.edu', '9000002222', 'Electronics', 4, hashPwd('Student@123'), b1.rows[0].bus_id]
      );

      console.log('✅ PostgreSQL seed data inserted successfully.');
    } else {
      console.log('ℹ️  PostgreSQL database already has records, skipping seed.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ PostgreSQL initialization failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initPostgres();
