const crypto = require('crypto');

/**
 * ✅ Reversible password encryption — used ONLY so an admin can view a
 * user's real password from the Admin Dashboard.
 *
 * IMPORTANT: bcrypt (used for `User.password`) is a ONE-WAY hash — it is
 * mathematically impossible to recover the original password from a bcrypt
 * hash. There is no backend change that can make `.select('+password')`
 * return a real password, because the real password was never stored.
 *
 * To let admin see the real password, we ALSO store a reversibly-encrypted
 * copy (AES-256-CBC) in a separate field (`passwordEnc`) whenever a
 * password is set. `password` (bcrypt) is still what login/comparePassword
 * uses — this encrypted copy is only ever decrypted for the admin list.
 *
 * SECURITY NOTE (as requested, accepted for this internal project):
 * Storing a reversible copy of user passwords is a real risk — anyone with
 * the ENCRYPTION_KEY and DB access can recover every user's real password.
 * Keep PASSWORD_ENC_KEY out of version control (.env only) and restrict
 * DB/server access. Do not reuse this pattern for anything customer-facing
 * beyond this internal Gram Panchayat tool without re-evaluating the risk.
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size

// ✅ Derive a stable 32-byte key from an env secret. Falls back to
// JWT_SECRET (already required elsewhere in this app) so nothing crashes
// if PASSWORD_ENC_KEY isn't set yet — but for real deployments, set a
// DEDICATED PASSWORD_ENC_KEY in .env, separate from JWT_SECRET.
const getKey = () => {
  const secret =
    process.env.PASSWORD_ENC_KEY ||
    process.env.JWT_SECRET ||
    'fallback-dev-only-key-change-me';

  if (!process.env.PASSWORD_ENC_KEY) {
    console.warn(
      '⚠️  PASSWORD_ENC_KEY not set in .env — falling back to JWT_SECRET. ' +
      'Set a dedicated PASSWORD_ENC_KEY (32+ random chars) in production.'
    );
  }

  // scrypt derives a consistent 32-byte key from any-length secret string
  return crypto.scryptSync(secret, 'namuna8-password-salt', 32);
};

/**
 * Encrypts plaintext -> "ivHex:cipherHex"
 */
const encryptPassword = (plainText) => {
  if (!plainText) return undefined;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypts "ivHex:cipherHex" -> plaintext. Returns null if the value is
 * missing or malformed (e.g. legacy users saved before this feature
 * existed, whose real password was never captured).
 */
const decryptPassword = (encryptedValue) => {
  if (!encryptedValue || !encryptedValue.includes(':')) return null;
  try {
    const [ivHex, dataHex] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('❌ Failed to decrypt password:', err.message);
    return null;
  }
};

module.exports = { encryptPassword, decryptPassword };