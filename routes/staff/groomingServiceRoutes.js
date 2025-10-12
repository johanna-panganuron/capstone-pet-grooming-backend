// routes/staff/groomingServiceRoutes.js
const express = require('express');
const router = express.Router();
const groomingServiceController = require('../../controllers/staff/groomingServiceController');
const authMiddleware = require('../../middleware/authMiddleware');

// Middleware to verify staff role
const verifyStaff = authMiddleware.authorize('staff');

// READ (Get All Services) - Staff can view all services
router.get('/',
  authMiddleware.verifyToken,
  verifyStaff,
  groomingServiceController.getAllServices
);

// READ (Get Available Services Only) - Staff can view available services
router.get('/available',
  authMiddleware.verifyToken,
  verifyStaff,
  groomingServiceController.getAvailableServices
);

// READ (Get Service Statistics) - Dashboard info for staff
router.get('/stats',
  authMiddleware.verifyToken,
  verifyStaff,
  groomingServiceController.getServiceStats
);

// READ (Get Services by Category) - Filter services by category
router.get('/category/:category',
  authMiddleware.verifyToken,
  verifyStaff,
  groomingServiceController.getServicesByCategory
);

// READ (Get Single Service) - Staff can view individual service
router.get('/:id',
  authMiddleware.verifyToken,
  verifyStaff,
  groomingServiceController.getServiceById
);

// UPDATE (Status Only) - Staff can ONLY update service status
router.patch('/:id/status',
  authMiddleware.verifyToken,
  verifyStaff,
  groomingServiceController.updateServiceStatus
);

// Note: Staff cannot:
// - Create new services (POST /)
// - Update full service details (PUT /:id)
// - Delete services (DELETE /:id)
// - Upload/change service images
// These operations are restricted to owners only

module.exports = router;