/**
 * validation.js
 * Strict validation and credential helpers for GIET Smart Bus System
 */
const crypto = require('crypto');

/**
 * Validates that an email ends strictly with @giet.edu
 * Examples allowed: student123@giet.edu, 23cse001@giet.edu, driver01@giet.edu
 * Examples rejected: student@gmail.com, student@giet.edu.in, student@giet.ac.in, student@something.com
 */
function isValidGietEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@giet\.edu$/i;
  return emailRegex.test(trimmed);
}

/**
 * Generates a unique system User ID based on role
 * Roles: student -> GIET-STU-XXXX, driver -> GIET-DRV-XXXX, manager -> GIET-MGR-XXXX
 */
function generateSystemUserId(role, db) {
  const prefixMap = {
    student: 'GIET-STU',
    driver:  'GIET-DRV',
    manager: 'GIET-MGR',
    admin:   'GIET-ADM'
  };
  const prefix = prefixMap[role] || 'GIET-USR';

  let uniqueId = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 50) {
    attempts++;
    const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    uniqueId = `${prefix}-${randomDigits}`;

    // Check collision across all user tables
    const inStudents = db.prepare('SELECT 1 FROM students WHERE system_user_id = ?').get(uniqueId);
    const inDrivers  = db.prepare('SELECT 1 FROM drivers WHERE system_user_id = ?').get(uniqueId);
    const inManagers = db.prepare('SELECT 1 FROM managers WHERE system_user_id = ?').get(uniqueId);
    const inAdmins   = db.prepare('SELECT 1 FROM admins WHERE system_user_id = ?').get(uniqueId);

    if (!inStudents && !inDrivers && !inManagers && !inAdmins) {
      exists = false;
    }
  }

  return uniqueId;
}

/**
 * Generates a secure temporary password
 * Meets high entropy criteria (upper, lower, digits, special character)
 */
function generateTempPassword() {
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const specials = '!@#$%&*';
  const allChars = lowers + uppers + digits + specials;

  const pick = (str) => str[crypto.randomInt(0, str.length)];

  // Guaranteed characters to meet all criteria
  const parts = [
    pick(uppers),
    pick(lowers),
    pick(digits),
    pick(specials)
  ];

  for (let i = 0; i < 6; i++) {
    parts.push(pick(allChars));
  }

  // Shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return `Giet#${pick(digits)}${parts.join('')}`;
}

module.exports = {
  isValidGietEmail,
  generateSystemUserId,
  generateTempPassword
};
