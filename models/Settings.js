const mongoose = require('mongoose');

const masterRateSchema = new mongoose.Schema(
  {
    desc: { type: String, default: '' },
    landRate: { type: Number, default: 0 },
    buildRate: { type: Number, default: 0 },
    constructionRate: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
  },
  { _id: false }
);

const areaTaxRateSchema = new mongoose.Schema(
  {
    range: { type: String, default: '' },
    arogya: { type: Number, default: 0 },
    diwabatti: { type: Number, default: 0 },
  },
  { _id: false }
);

const depreciationRateSchema = new mongoose.Schema(
  {
    age: { type: String, default: '' },
    type1: { type: Number, default: 0 },
    type2: { type: Number, default: 0 },
  },
  { _id: false }
);

// ✅ CHANGED: rate tables (masterRates / areaTaxRates / depreciationRates)
// are no longer a single global singleton — every Gram Panchayat now gets
// its OWN independent Settings document, looked up by `gramPanchayatName`.
// See controllers/settingsController.js (getOrCreateSettings) for how a
// document is found/created per Gram Panchayat.
const settingsSchema = new mongoose.Schema(
  {
    // ✅ LEGACY: before rates became Gram-Panchayat-wise there was exactly
    // ONE settings document identified by `key: 'global-rates'`. This field
    // is kept ONLY so getOrCreateSettings can find that old document once,
    // to migrate/seed a Gram Panchayat's very first rates from it instead
    // of silently resetting everyone back to the hardcoded defaults. New
    // (per-Gram-Panchayat) documents never set this field.
    key: {
      type: String,
    },
    // ✅ NEW: which Gram Panchayat this rate table belongs to. '' is used
    // for legacy/unassigned (e.g. an admin who hasn't picked a Gram
    // Panchayat yet) and is treated as just another independent scope.
    gramPanchayatName: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    masterRates: {
      type: [masterRateSchema],
      default: [],
    },
    areaTaxRates: {
      type: [areaTaxRateSchema],
      default: [],
    },
    depreciationRates: {
      type: [depreciationRateSchema],
      default: [],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Settings', settingsSchema);