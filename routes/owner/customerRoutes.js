// ===== routes/owner/customerRoutes.js =====
const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/owner/customerController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');

// Protect all routes — owner only
router.use(verifyToken, authorize('owner'));

// ✅ Get customer statistics (MUST be before /:id routes)
router.get('/stats', customerController.getCustomerStats);

// ✅ Get all customers with pagination and filtering
router.get('/', customerController.getAllCustomers);

// ✅ Add new walk-in customer (WITH FILE UPLOAD MIDDLEWARE)
router.post('/', 
  customerController.uploadProfilePhoto, // Add multer middleware here
  customerController.addCustomer
);

// ✅ Get specific customer details
router.get('/:id/details', customerController.getCustomerDetails);

// ✅ Get single customer by ID
router.get('/:id', customerController.getCustomerById);

// ✅ Update customer (WITH FILE UPLOAD MIDDLEWARE)
router.put('/:id', 
  customerController.uploadProfilePhoto, // Add multer middleware here
  customerController.updateCustomer
);

// ✅ Delete customer
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;