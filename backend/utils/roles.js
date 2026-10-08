/**
 * roles.js
 * Centralized Role-Based Access Control (RBAC) Role Definitions & Utilities
 */

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  DRIVER: 'DRIVER',
  STUDENT: 'STUDENT'
});

/**
 * Normalizes any role string to uppercase standard role.
 * Example: 'admin' -> 'ADMIN', 'driver' -> 'DRIVER'
 */
function normalizeRole(role) {
  if (!role || typeof role !== 'string') return '';
  const upper = role.trim().toUpperCase();
  if (Object.values(ROLES).includes(upper)) {
    return upper;
  }
  return upper;
}

/**
 * Checks if a given role is one of the valid 4 system roles
 */
function isValidRole(role) {
  const normalized = normalizeRole(role);
  return Object.values(ROLES).includes(normalized);
}

module.exports = {
  ROLES,
  normalizeRole,
  isValidRole
};
