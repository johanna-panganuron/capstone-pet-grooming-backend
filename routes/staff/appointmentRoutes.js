// routes\staff\appointmentRoutes.js
const express = require('express');
const router = express.Router();
const staffAppointmentController = require('../../controllers/staff/appointmentController');
const authMiddleware = require('../../middleware/authMiddleware');
const db = require('../../models/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../../../uploads/appointments/');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.params.id}-${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Middleware to verify staff role
const verifyStaff = (req, res, next) => {
  if (req.user.role !== 'staff') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This endpoint is only for Mimis Pet Grooming Staff'
    });
  }
  next();
};

// ===================
// NEW QUEUE ROUTES
// ===================

// Get today's queue
router.get('/queue/today',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getTodaysQueue
);

// Get current queue numbers for display
router.get('/queue/current',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getCurrentQueue
);

// ===================
// DASHBOARD & STATS ROUTES
// ===================

// Get appointment statistics/dashboard
router.get('/stats',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentStats
);

// Get today's appointments
router.get('/today',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getTodaysAppointments
);

// Get appointments by date range
router.get('/date-range',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentsByDateRange
);

// ===================
// RESOURCE ROUTES
// ===================

// Get available services
router.get('/services',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAvailableServices
);

// Get available groomers
router.get('/groomers',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAvailableGroomers
);

// ===================
// BULK OPERATIONS
// ===================

// Bulk operations
router.patch('/bulk/status-update',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.bulkStatusUpdate
);

// ===================
// FILTER ROUTES
// ===================

// Get appointments by status (specific pattern)
router.get('/status/:status',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentsByStatus
);

// Get appointments by groomer (specific pattern)
router.get('/groomer/:groomerId',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentsByGroomer
);

// ===================
// GENERAL ROUTES
// ===================

// Get all appointments with filtering options
router.get('/',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAllAppointments
);

// Receipt route
router.get('/:id/receipt',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.generateReceipt
);

// Get available time slots
router.get('/time-slots/:date',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAvailableTimeSlots
);

// ===================
// IMAGE UPLOAD ROUTES
// ===================

// Upload before/after images for completed appointment
router.post('/:id/upload-images',
  authMiddleware.verifyToken,
  verifyStaff,
  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
  ]),
  staffAppointmentController.uploadAppointmentImages
);

// Serve appointment images
router.get('/images/:filename',
  staffAppointmentController.serveAppointmentImage
);

// ===================
// APPOINTMENT-SPECIFIC ROUTES
// ===================

// Assign groomer
router.patch('/:id/assign-groomer',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.assignGroomer
);

// Add multiple services
router.post('/:id/add-services',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.addServicesToAppointment
);

// Single service addition
router.post('/:id/add-service',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.addServiceToAppointment
);

// Reschedule appointment
router.put('/:id/reschedule', 
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.rescheduleAppointment
);

// Remove service
router.delete('/:id/services/:serviceId',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.removeServiceFromAppointment
);

// Get service summary
router.get('/:id/services',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentServices
);

// Get appointment ratings
router.get('/:id/ratings',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentRatings
);

// Update appointment status
router.patch('/:id/status',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.updateAppointmentStatus
);

// Mark as waiting (with daily queue assignment)
router.post('/:id/waiting',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.markAsWaiting
);

// Session management
router.post('/:id/start-session',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.startAppointmentSession
);

router.post('/:id/end-session',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.endAppointmentSession
);

// Cancel appointment
router.patch('/:id/cancel',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.cancelAppointment
);

router.patch('/:id/cancel-with-reason',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.cancelAppointmentWithReason
);

// Update pricing
router.patch('/:id/pricing',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.updateAppointmentPricing
);

// Set actual schedule
router.patch('/:id/actual-schedule',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.setActualSchedule
);

// Update notes
router.patch('/:id/notes',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.updateAppointmentNotes
);

// Mark as no show
router.patch('/:id/no-show',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.markAsNoShow
);

// ===================
// PAYMENT ROUTES
// ===================

// Payment management
router.post('/:id/payment/cash',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.processCashPayment
);

router.patch('/:id/payment/mark-paid',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.markPaymentAsPaid
);

router.post('/:id/payment/gcash',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.initiateGCashPayment
);

router.get('/:id/payments',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentPayments
);

// GCash webhook
router.post('/webhook/gcash',
  staffAppointmentController.gcashPaymentWebhook
);

// Refund payment
router.post('/:id/refund',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.refundPayment
);

// ===================
// FINAL ROUTE - GET APPOINTMENT DETAILS
// ===================

router.get('/:id',
  authMiddleware.verifyToken,
  verifyStaff,
  staffAppointmentController.getAppointmentDetails
);

module.exports = router;