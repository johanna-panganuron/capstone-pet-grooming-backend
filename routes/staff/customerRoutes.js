// ===== routes/staff/customerRoutes.js =====
const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/staff/customerController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');

// Protect all routes — staff only
router.use(verifyToken, authorize('staff'));

// Get customer statistics (MUST be before /:id routes)
router.get('/stats', customerController.getCustomerStats);

// Get all customers with pagination and filtering
router.get('/', customerController.getAllCustomers);

// Add new walk-in customer (WITH FILE UPLOAD MIDDLEWARE)
router.post('/', 
  customerController.uploadProfilePhoto,
  customerController.addCustomer
);

// Get specific customer details
router.get('/:id/details', customerController.getCustomerDetails);

// Get single customer by ID
router.get('/:id', customerController.getCustomerById);

// Update customer (WITH FILE UPLOAD MIDDLEWARE)
router.put('/:id', 
  customerController.uploadProfilePhoto,
  customerController.updateCustomer
);

module.exports = router;