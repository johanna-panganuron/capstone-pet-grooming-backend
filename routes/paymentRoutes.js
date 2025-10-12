// routes/paymentRoutes.js - Enhanced with mock testing endpoints
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const emailService = require('../utils/email');

// Middleware to verify pet owner role
const verifyPetOwner = (req, res, next) => {
  if (req.user.role !== 'pet_owner') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This endpoint is only for pet owners.'
    });
  }
  next();
};

// CREATE PAYMENT FOR APPOINTMENT
router.post('/create', 
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.createPayment
);

// GET PAYMENT STATUS
router.get('/:paymentId/status',
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.checkPaymentStatus
);

// GET PAYMENT HISTORY
router.get('/history',
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.getPaymentHistory
);

// CANCEL PAYMENT
router.patch('/:paymentId/cancel',
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.cancelPayment
);

// GCASH WEBHOOK/CALLBACK (no auth required as it comes from GCash)
router.post('/gcash/callback',
  paymentController.handleGCashCallback
);

// VERIFY GCASH PAYMENT (for manual verification)
router.post('/gcash/verify/:paymentId',
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.checkPaymentStatus
);

// 🎭 MOCK TESTING ENDPOINTS (for development/testing only)
// These should be removed or protected in production

// Manual complete payment (useful for testing the success flow)
router.post('/mock/complete/:paymentId',
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.mockCompletePayment
);

// Manual fail payment (useful for testing the failure flow)
router.post('/mock/fail/:paymentId',
  authMiddleware.verifyToken,
  verifyPetOwner,
  paymentController.mockFailPayment
);

module.exports = router;