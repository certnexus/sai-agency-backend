const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  getRegisteredUsers,
  getMe,
  resetPassword,
  changePassword,
} = require('../controllers/authController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ✅ Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only admin can access this resource'
    });
  }
  next();
};

const registerValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('name').optional().trim(),
  body('panchayat').optional().trim(),
  body('village').optional().trim(),
  body('taluka').optional().trim(),
  body('district').optional().trim(),
  // ✅ NEW: कर आकारणी वर्ष (Assessment Year) — optional free-text field.
  body('assessmentYear').optional().trim(),
];

const loginValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ✅ Reset password validation (Admin -> any user, no old password needed)
const resetPasswordValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

// ✅ NEW: Change password validation (Self-service -> requires old password)
const changePasswordValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('oldPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

// Public routes
router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);

// ✅ NEW: Public self-service change-password route (used from Register page).
// Verifies the current password before allowing the change, so it is safe
// to expose without requiring a logged-in session.
router.post('/change-password', changePasswordValidation, validate, changePassword);

// Protected routes
router.get('/me', protect, getMe);  // ✅ सभी logged-in user अपना data देख सकते हैं

// Admin-only routes
router.get('/users', protect, adminOnly, getRegisteredUsers);  // ✅ सिर्फ admin सभी users देख सकता है

// Admin reset password route
router.post('/admin/reset-password', protect, adminOnly, resetPasswordValidation, validate, resetPassword);

module.exports = router;