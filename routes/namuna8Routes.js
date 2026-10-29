const express = require('express');
const { body } = require('express-validator');
const {
  getAllNamuna8,
  getPeopleList,
  getNamuna8ById,
  createNamuna8,
  updateNamuna8,
  deleteNamuna8,
  searchNamuna8,
  downloadAllNamuna8,
  downloadMyNamuna8,
  downloadGramPanchayatFile,     // Gram Panchayat full file (3 sheets)
  getGramPanchayatList,          // ✅ NEW: distinct panchayat list for admin's global filter
} = require('../controllers/namuna8Controller');

const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

const namuna8Validation = [
  body('fields').optional().isObject().withMessage('fields must be an object'),
  body('fields.serial').optional().trim(),
  body('fields.owner').optional().trim(),
  body('fields.occupant').optional().trim(),
  body('fields.panchayat').optional().trim(),
  body('fields.village').optional().trim(),
  body('fields.taluka').optional().trim(),
  body('fields.district').optional().trim(),
  body('fields.ward').optional().trim(),
  body('fields.property').optional().trim(),
  body('fields.address').optional().trim(),
  body('tableRows').optional().isArray().withMessage('tableRows must be an array'),
  body('taxNotApply').optional().isBoolean(),
  body('directions').optional().isObject(),
  body('taxInfo').optional().isObject(),
  body('appealAndRemark').optional().isObject(),
  body('masterRates').optional().isArray(),
  body('areaTaxRates').optional().isArray(),
  body('depreciationRates').optional().isArray(),
];

// Search route — scoped to the logged-in Grampanchayat user's own
// scoped to their own Grampanchayat (see searchNamuna8).
router.get('/search', protect, searchNamuna8);

// Download routes (require login — admin-only checks happen inside the
// controllers themselves for the all-Grampanchayat exports).
router.get('/download/all', protect, downloadAllNamuna8);  // Admin - सब Grampanchayats का data
router.get('/download/my', protect, downloadMyNamuna8);    // User - अपल्या Grampanchayat चा data

// ✅ NEW: Direct Gram Panchayat File Download (background wali file with 3 sheets) — admin-only
router.get('/download/grampanchayat', protect, downloadGramPanchayatFile);

// ✅ NEW: Distinct Grampanchayat list for the People List "Global filter" dropdown (admin-only)
router.get('/panchayats', protect, getGramPanchayatList);

// People list route — results are scoped to the logged-in
// user's Grampanchayat (admins see everything, optionally filterable).
router.get('/people-list', protect, getPeopleList);

// Get all
router.get('/', protect, getAllNamuna8);

// Get by ID
router.get('/:id', protect, getNamuna8ById);

// Create
router.post('/', protect, namuna8Validation, validate, createNamuna8);

// Update
router.put('/:id', protect, namuna8Validation, validate, updateNamuna8);

// Delete
router.delete('/:id', protect, deleteNamuna8);

module.exports = router;