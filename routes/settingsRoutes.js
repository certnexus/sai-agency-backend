const express = require('express');
const { body } = require('express-validator');
const {
  getSettings,
  updateSettings,
  getSettingsPanchayatList,
} = require('../controllers/settingsController');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const settingsValidation = [
  // ✅ NEW: admin-only — which Gram Panchayat's rates to update.
  body('panchayat').optional().trim(),
  body('masterRates').optional().isArray().withMessage('masterRates must be an array'),
  body('areaTaxRates').optional().isArray().withMessage('areaTaxRates must be an array'),
  body('depreciationRates').optional().isArray().withMessage('depreciationRates must be an array'),
];

// ✅ CHANGED: rates are now Per Gram Panchayat, so a logged-in user is
// required (`protect`, not the old `optionalAuth`) — the server needs to
// know WHICH Gram Panchayat's rates to read/write. A normal user is always
// locked to their own Gram Panchayat; an admin must pass `?panchayat=` /
// body.panchayat. See settingsController.resolveGramPanchayat.
router.get('/', protect, getSettings);
router.put('/', protect, settingsValidation, validate, updateSettings);

// ✅ NEW: Admin-only — list of Gram Panchayat names to power a rate-table
// Gram Panchayat picker in the admin UI.
router.get('/panchayats', protect, adminOnly, getSettingsPanchayatList);

module.exports = router;