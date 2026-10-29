const express = require('express');
const { body } = require('express-validator');
const {
  getAllNamuna9,
  getNamuna9ById,
  getNamuna9ByAnukramank,
  getNextAnukramank,
  createNamuna9,
  updateNamuna9,
  deleteNamuna9,
  fetchFromNamuna8,
  bulkSaveTax,
  downloadAllNamuna9,
  downloadMyNamuna9,
  exportNamuna9Excel,
  downloadNamuna9BillExcel,
  getNamuna9Panchayats,
} = require('../controllers/namuna9Controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

const namuna9Validation = [
  body('anukramank').optional().trim(),
  body('malmattaKramank').optional().trim(),
  body('wardKramank').optional().trim(),
  body('gharMalakName').optional().trim(),
  body('patiName').optional().trim(),
  body('bhogvatadarName').optional().trim(),
  body('previousYear').optional().trim(),
  body('currentYear').optional().trim(),
  body('magilGharPatti').optional().isNumeric(),
  body('chaluGharPatti').optional().isNumeric(),
  body('magilDiwabatti').optional().isNumeric(),
  body('chaluDiwabatti').optional().isNumeric(),
  body('magilArogya').optional().isNumeric(),
  body('chaluArogya').optional().isNumeric(),
  body('magilPanipattiSamanya').optional().isNumeric(),
  body('chaluPanipattiSamanya').optional().isNumeric(),
  body('magilPanipattiVishesh').optional().isNumeric(),
  body('chaluPanipattiVishesh').optional().isNumeric(),
  body('magilItar').optional().isNumeric(),
  body('chaluItar').optional().isNumeric(),
  body('magilGharPattiVasuli').optional().isNumeric(),
  body('chaluGharPattiVasuli').optional().isNumeric(),
  body('magilDiwabattiVasuli').optional().isNumeric(),
  body('chaluDiwabattiVasuli').optional().isNumeric(),
  body('magilArogyaVasuli').optional().isNumeric(),
  body('chaluArogyaVasuli').optional().isNumeric(),
  body('magilPanipattiVasuli').optional().isNumeric(),
  body('chaluPanipattiVasuli').optional().isNumeric(),
  body('magilItarVasuli').optional().isNumeric(),
  body('chaluItarVasuli').optional().isNumeric(),
  body('status').optional().isIn(['बाकी', 'भरले', 'रद्द']),
  body('shera').optional().trim(),
  body('pavatiKramank').optional().trim(),
];

// ============================================
// 📥 DOWNLOAD ROUTES
// ============================================

// ✅ Admin के लिए - सब users का data
router.get('/download/all', protect, downloadAllNamuna9);

// ✅ User के लिए - सिर्फ अपना data
router.get('/download/my', protect, downloadMyNamuna9);

// ✅ NEW: Anukramank ने filter करून एका record चा Demand Bill Excel
// (Main Copy + Carbon Copy) डाउनलोड — "Excel Bill Filter" चा equivalent.
router.get('/download/bill', protect, downloadNamuna9BillExcel);

// ============================================
// 📋 CRUD ROUTES
// ============================================

// 🔒 Every route requires login (protect) so every controller can scope
// results to the logged-in user's Grampanchayat.
//
// NOTE: '/next-anukramank' and '/by-anukramank/:anukramank' MUST be
// registered before the generic '/:id' route below, otherwise Express
// would match them as `id = "next-anukramank"` etc.
router.get('/next-anukramank', protect, getNextAnukramank);
router.get('/by-anukramank/:anukramank', protect, getNamuna9ByAnukramank);
// ✅ NEW: Admin-only distinct Grampanchayat list for the Namuna 9 page's
// "ग्रामपंचायत फिल्टर" dropdown. Must be registered before '/:id'.
router.get('/panchayats', protect, getNamuna9Panchayats);
router.get('/', protect, getAllNamuna9);
router.get('/:id', protect, getNamuna9ById);
router.post('/fetch-from-namuna8', protect, fetchFromNamuna8);
router.post('/bulk-save', protect, bulkSaveTax);
router.post('/', protect, namuna9Validation, validate, createNamuna9);
router.put('/:id', protect, namuna9Validation, validate, updateNamuna9);
router.delete('/:id', protect, deleteNamuna9);

// ============================================
// 🔄 LEGACY EXPORT (अगर कहीं else से use हो)
// ============================================

// पुरानी जगह के लिए (deprecated - use downloadMyNamuna9 instead)
router.get('/export/excel', protect, exportNamuna9Excel);

module.exports = router;