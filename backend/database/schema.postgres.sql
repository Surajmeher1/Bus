-- ============================================================
-- Smart University Bus Tracking System
-- PostgreSQL Production Schema & Seed Migration
-- Compatible with PostgreSQL 14+, Supabase, Neon, AWS RDS, Render Postgres
-- ============================================================

-- Clean up existing tables (idempotent setup)
-- DROP TABLE IF EXISTS maintenance_records CASCADE;
-- DROP TABLE IF EXISTS fuel_records CASCADE;
-- DROP TABLE IF EXISTS activity_logs CASCADE;
-- DROP TABLE IF EXISTS feedback CASCADE;
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS pickup_points CASCADE;
-- DROP TABLE IF EXISTS trips CASCADE;
-- DROP TABLE IF EXISTS students CASCADE;
-- DROP TABLE IF EXISTS buses CASCADE;
-- DROP TABLE IF EXISTS bus_stops CASCADE;
-- DROP TABLE IF EXISTS routes CASCADE;
-- DROP TABLE IF EXISTS drivers CASCADE;
-- DROP TABLE IF EXISTS managers CASCADE;
-- DROP TABLE IF EXISTS admins CASCADE;

-- ── 1. Admins ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
    admin_id    SERIAL PRIMARY KEY,
    username    VARCHAR(100) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    email       VARCHAR(255),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Managers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS managers (
    manager_id  SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    phone       VARCHAR(50),
    password    VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. Drivers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
    driver_id       SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    password        VARCHAR(255),
    phone           VARCHAR(50),
    license_number  VARCHAR(100) UNIQUE,
    address         TEXT,
    photo           TEXT,
    is_active       SMALLINT DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 4. Routes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
    route_id    SERIAL PRIMARY KEY,
    route_name  VARCHAR(200) NOT NULL,
    source      VARCHAR(200) NOT NULL,
    destination VARCHAR(200) NOT NULL,
    distance    NUMERIC(6, 2),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 5. Bus Stops ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bus_stops (
    stop_id     SERIAL PRIMARY KEY,
    route_id    INTEGER NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
    stop_name   VARCHAR(200) NOT NULL,
    latitude    NUMERIC(10, 6) NOT NULL,
    longitude   NUMERIC(10, 6) NOT NULL,
    stop_order  INTEGER NOT NULL
);

-- ── 6. Buses ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buses (
    bus_id              SERIAL PRIMARY KEY,
    bus_number          VARCHAR(50) NOT NULL UNIQUE,
    registration_number VARCHAR(100) NOT NULL UNIQUE,
    capacity            INTEGER NOT NULL DEFAULT 50,
    available_seats     INTEGER NOT NULL DEFAULT 50,
    driver_id           INTEGER REFERENCES drivers(driver_id) ON DELETE SET NULL,
    manager_id          INTEGER REFERENCES managers(manager_id) ON DELETE SET NULL,
    route_id            INTEGER REFERENCES routes(route_id) ON DELETE SET NULL,
    active_trip_id      INTEGER,
    current_latitude    NUMERIC(10, 6) DEFAULT 0,
    current_longitude   NUMERIC(10, 6) DEFAULT 0,
    current_speed       NUMERIC(6, 2) DEFAULT 0,
    status              VARCHAR(30) DEFAULT 'inactive'
                        CHECK(status IN ('running','delayed','maintenance','cancelled','inactive','offline')),
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 7. Students ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    student_id    SERIAL PRIMARY KEY,
    roll_number   VARCHAR(50) NOT NULL UNIQUE,
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    phone         VARCHAR(50),
    department    VARCHAR(100),
    semester      INTEGER,
    password      VARCHAR(255) NOT NULL,
    favorite_bus  INTEGER REFERENCES buses(bus_id) ON DELETE SET NULL,
    profile_photo TEXT,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 8. Trips ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
    trip_id     SERIAL PRIMARY KEY,
    bus_id      INTEGER NOT NULL REFERENCES buses(bus_id) ON DELETE CASCADE,
    driver_id   INTEGER REFERENCES drivers(driver_id) ON DELETE SET NULL,
    route_id    INTEGER REFERENCES routes(route_id) ON DELETE SET NULL,
    start_time  TIMESTAMPTZ,
    end_time    TIMESTAMPTZ,
    gps_mode    VARCHAR(30) DEFAULT 'SIMULATION',
    status      VARCHAR(30) DEFAULT 'scheduled'
                CHECK(status IN ('scheduled','running','completed','cancelled')),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 9. Pickup Points ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pickup_points (
    pickup_id            SERIAL PRIMARY KEY,
    route_id             INTEGER REFERENCES routes(route_id) ON DELETE CASCADE,
    trip_id              INTEGER REFERENCES trips(trip_id) ON DELETE SET NULL,
    bus_id               INTEGER REFERENCES buses(bus_id) ON DELETE CASCADE,
    name                 VARCHAR(150) NOT NULL,
    description          TEXT,
    latitude             NUMERIC(10, 6) NOT NULL,
    longitude            NUMERIC(10, 6) NOT NULL,
    created_by_driver_id INTEGER REFERENCES drivers(driver_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 10. Notifications ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    receiver_type   VARCHAR(30) DEFAULT 'all'
                    CHECK(receiver_type IN ('all','student','manager','bus')),
    receiver_id     INTEGER,
    sent_by_type    VARCHAR(30),
    sent_by_id      INTEGER,
    is_emergency    SMALLINT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 11. Feedback ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    bus_id      INTEGER NOT NULL REFERENCES buses(bus_id) ON DELETE CASCADE,
    message     TEXT,
    rating      SMALLINT CHECK(rating BETWEEN 1 AND 5),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 12. Activity Logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    log_id      SERIAL PRIMARY KEY,
    user_type   VARCHAR(50),
    user_id     INTEGER,
    action      VARCHAR(150) NOT NULL,
    details     TEXT,
    ip_address  VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 13. Fuel Records ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_records (
    record_id   SERIAL PRIMARY KEY,
    bus_id      INTEGER NOT NULL REFERENCES buses(bus_id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    liters      NUMERIC(8, 2) NOT NULL,
    cost        NUMERIC(10, 2) NOT NULL,
    odometer    NUMERIC(10, 2),
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── 14. Maintenance Records ────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_records (
    record_id   SERIAL PRIMARY KEY,
    bus_id      INTEGER NOT NULL REFERENCES buses(bus_id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    description TEXT NOT NULL,
    cost        NUMERIC(10, 2),
    mechanic    VARCHAR(150),
    status      VARCHAR(30) DEFAULT 'completed',
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── Performance Indexes ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);
CREATE INDEX IF NOT EXISTS idx_buses_route ON buses(route_id);
CREATE INDEX IF NOT EXISTS idx_bus_stops_route ON bus_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers(email);
CREATE INDEX IF NOT EXISTS idx_trips_bus ON trips(bus_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
