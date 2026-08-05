const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/bustrack.db');

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  console.log('✅ SQLite database connected:', DB_PATH);
} catch (err) {
  console.error('❌ Database connection failed:', err.message);
  process.exit(1);
}

module.exports = db;
