const crypto = require('crypto');

// Excludes visually ambiguous characters (0/O, 1/I/L) since registration IDs
// and temporary passwords get read aloud, typed from a printout, etc.
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';

function randomFrom(alphabet, length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Generates a customer-facing registration ID, e.g. "CCI-7K4QN2". Uniqueness
 * is enforced by the database's UNIQUE constraint on companies.registration_id;
 * callers should retry with a fresh ID on a 23505 conflict (see
 * internal.controller.js), though at this alphabet/length a collision is
 * astronomically unlikely.
 */
function generateRegistrationId() {
  return `CCI-${randomFrom(ID_ALPHABET, 6)}`;
}

/**
 * Generates a temporary password for an admin-issued account. Meets the
 * app's 10-character minimum with room to spare, and mixes character
 * classes without relying on any single required-position rule (keeps the
 * generator simple while still being strong).
 */
function generateTemporaryPassword() {
  return randomFrom(PASSWORD_ALPHABET, 14);
}

module.exports = { generateRegistrationId, generateTemporaryPassword };
