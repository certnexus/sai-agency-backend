const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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

module.exports = mongoose.model('User', userSchema);