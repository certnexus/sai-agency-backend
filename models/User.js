const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encryptPassword, decryptPassword } = require('../utils/passwordCrypto');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    // ✅ NEW: reversibly-encrypted copy of the real password, so an Admin
    // can view it from the dashboard. `password` above (bcrypt hash) is
    // still what login uses — this field is only ever decrypted for the
    // admin-only getRegisteredUsers response. See utils/passwordCrypto.js
    // for the security tradeoffs of this approach.
    passwordEnc: {
      type: String,
      select: false,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    gramPanchayatName: {
      type: String,
      trim: true,
      default: '',
    },
    village: {
      type: String,
      trim: true,
      default: '',
    },
    taluka: {
      type: String,
      trim: true,
      default: '',
    },
    district: {
      type: String,
      trim: true,
      default: '',
    },
    // ✅ NEW: कर आकारणी वर्ष (Assessment Year) — captured at registration
    // and stored on the user's profile (e.g. "2025-2026").
    assessmentYear: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  // ✅ Capture a reversible, encrypted copy of the REAL password BEFORE it
  // gets bcrypt-hashed below (bcrypt is one-way — this is the only point
  // where the plaintext ever exists in memory).
  this.passwordEnc = encryptPassword(this.password);
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    username: this.username,
    name: this.name || this.username,
    gramPanchayatName: this.gramPanchayatName,
    village: this.village,
    taluka: this.taluka,
    district: this.district,
    // ✅ NEW: expose the Assessment Year on the public profile so the
    // frontend (Dashboard, Namuna 8/9 forms, etc.) can read/display it.
    assessmentYear: this.assessmentYear,
    role: this.role,
    timestamp: this.createdAt,
  };
};

// ✅ NEW: Admin-only variant of toPublicJSON — additionally includes the
// REAL (decrypted) password. Only ever call this from routes already
// gated behind the `adminOnly` middleware (see authRoutes.js), and only
// with a document fetched via `.select('+passwordEnc')`.
//
// `password` will be `null` for any user who registered/reset BEFORE this
// feature existed — their real password was never captured (bcrypt hashes
// cannot be reversed), so there is nothing to show until they next
// register, change, or have their password reset.
userSchema.methods.toAdminJSON = function toAdminJSON() {
  return {
    ...this.toPublicJSON(),
    password: this.passwordEnc ? decryptPassword(this.passwordEnc) : null,
  };
};

module.exports = mongoose.model('User', userSchema);