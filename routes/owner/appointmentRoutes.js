// routes\owner\appointmentRoutes.js
const express = require('express');
const router = express.Router();
const ownerAppointmentController = require('../../controllers/owner/appointmentController');
const authMiddleware = require('../../middleware/authMiddleware');
const db = require('../../models/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/appointments/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${req.params.id}-${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Middleware to verify owner role
const verifyOwner = (req, res, next) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. This endpoint is only for Mimis Pet Grooming Owner'
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
  verifyOwner,
  ownerAppointmentController.getTodaysQueue
);

// Get current queue numbers for display
router.get('/queue/current',
  authMiddleware.verifyToken,
  verifyOwner,
  async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [inProgress] = await db.execute(`
        SELECT daily_queue_number 
        FROM appointments 
        WHERE queue_date = ? 
        AND status = 'in_progress'
        ORDER BY daily_queue_number ASC
      `, [today]);
      
      const queueNumbers = inProgress.map(appt => appt.daily_queue_number);
      
      res.status(200).json({
        success: true,
        data: queueNumbers,
        count: queueNumbers.length
      });
    } catch (error) {
      console.error('Error getting current queue:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting current queue',
        error: error.message
      });
    }
  }
);

// ===================
// DASHBOARD & STATS ROUTES
// ===================

// Get appointment statistics/dashboard
router.get('/stats',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAppointmentStats
);

// Get today's appointments
router.get('/today',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getTodaysAppointments
);

// Get appointments by date range
router.get('/date-range',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAppointmentsByDateRange
);

// ===================
// RESOURCE ROUTES
// ===================

// Get available services
router.get('/services',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAvailableServices
);

// Get available groomers
router.get('/groomers',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAvailableGroomers
);

// ===================
// BULK OPERATIONS
// ===================

// Bulk operations
router.patch('/bulk/status-update',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.bulkStatusUpdate
);

// ===================
// FILTER ROUTES
// ===================

// Get appointments by status (specific pattern)
router.get('/status/:status',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAppointmentsByStatus
);

// Get appointments by groomer (specific pattern)
router.get('/groomer/:groomerId',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAppointmentsByGroomer
);

// ===================
// GENERAL ROUTES
// ===================

// Get all appointments with filtering options
router.get('/',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAllAppointments
);

// Receipt route
router.get('/:id/receipt',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.generateReceipt
);

// Get available time slots
router.get('/time-slots/:date',
  authMiddleware.verifyToken,
  verifyOwner,
  async (req, res, next) => {
    try {
      const { date } = req.params;
      const { exclude_appointment } = req.query;

      console.log('🕐 Checking time slots for date:', date);

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD.'
        });
      }

      // Get booked time slots for the date
      let query = `
        SELECT DISTINCT preferred_time 
        FROM appointments 
        WHERE preferred_date = ? 
        AND status NOT IN ('cancelled', 'completed', 'no_show')
      `;
      
      const params = [date];

      // Exclude specific appointment if provided (for rescheduling)
      if (exclude_appointment) {
        query += ' AND id != ?';
        params.push(exclude_appointment);
      }

      query += ' ORDER BY preferred_time';

      const [bookedRows] = await db.execute(query, params);

      // Base time slots in 12-hour format
      const allTimeSlots12h = [
        '9:00 AM', '10:00 AM', '11:00 AM', 
        '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'
      ];

      // Convert database times to 12-hour format
      const bookedTimeSlots12h = bookedRows.map(row => {
        const dbTime = row.preferred_time;
        return convertTo12Hour(dbTime);
      });

      // Calculate available slots
      const availableTimeSlots12h = allTimeSlots12h.filter(slot => 
        !bookedTimeSlots12h.includes(slot)
      );

      res.status(200).json({
        success: true,
        data: {
          date,
          allTimeSlots: allTimeSlots12h,
          bookedTimeSlots: bookedTimeSlots12h,
          availableTimeSlots: availableTimeSlots12h
        }
      });

    } catch (error) {
      console.error('❌ Error fetching time slots:', error);
      next(error);
    }
  }
);

// Helper function to convert 24-hour to 12-hour format
function convertTo12Hour(time24h) {
  if (!time24h) return '';
  
  const timeParts = time24h.split(':');
  if (timeParts.length < 2) return time24h;
  
  let hours = parseInt(timeParts[0]);
  const minutes = timeParts[1];
  
  if (isNaN(hours)) return time24h;
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  return `${hours}:${minutes} ${ampm}`;
}

// ===================
// IMAGE UPLOAD ROUTES
// ===================

// Upload before/after images for completed appointment
router.post('/:id/upload-images',
  authMiddleware.verifyToken,
  verifyOwner,
  upload.fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      if (!req.files?.beforeImage || !req.files?.afterImage) {
        return res.status(400).json({
          success: false,
          message: 'Both before and after images are required'
        });
      }

      const beforeImagePath = req.files.beforeImage[0].path;
      const afterImagePath = req.files.afterImage[0].path;

      const [result] = await db.execute(
        `UPDATE appointments 
         SET before_image = ?, after_image = ?, upload_notes = ?, has_images = TRUE, updated_at = NOW()
         WHERE id = ?`,
        [beforeImagePath, afterImagePath, notes || null, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Images uploaded successfully',
        data: {
          beforeImage: beforeImagePath,
          afterImage: afterImagePath,
          notes: notes
        }
      });

    } catch (error) {
      console.error('Error uploading images:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading images',
        error: error.message
      });
    }
  }
);

// Serve appointment images
router.get('/images/:filename',
  async (req, res) => {
    try {
      const { filename } = req.params;
      const uploadsPath = path.join(process.cwd(), 'uploads', 'appointments');
      const imagePath = path.join(uploadsPath, filename);
      
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({
          success: false,
          message: 'Image not found'
        });
      }

      const ext = path.extname(filename).toLowerCase();
      const contentTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };

      res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      res.sendFile(path.resolve(imagePath));
    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({
        success: false,
        message: 'Error serving image'
      });
    }
  }
);

// ===================
// APPOINTMENT-SPECIFIC ROUTES
// ===================

// Assign groomer
router.patch('/:id/assign-groomer',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.assignGroomer
);

// Add multiple services
router.post('/:id/add-services',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.addServicesToAppointment
);

// Single service addition
router.post('/:id/add-service',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.addServiceToAppointment
);

// Reschedule appointment
router.put('/:id/reschedule', 
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.rescheduleAppointment
);

// Remove service
router.delete('/:id/services/:serviceId',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.removeServiceFromAppointment
);

// Get service summary
router.get('/:id/services',
  authMiddleware.verifyToken,
  verifyOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      const Appointment = require('../../models/Appointment');
      
      const serviceSummary = await Appointment.getServiceSummary(id);
      
      if (!serviceSummary) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found'
        });
      }

      res.status(200).json({
        success: true,
        data: serviceSummary
      });
    } catch (error) {
      console.error('❌ Error getting service summary:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting service summary',
        error: error.message
      });
    }
  }
);

// Get appointment ratings
router.get('/:id/ratings',
  authMiddleware.verifyToken,
  verifyOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const [rows] = await db.execute(`
        SELECT 
          r.*,
          u.name as customer_name
        FROM ratings r
        JOIN appointments a ON r.appointment_id = a.id
        JOIN users u ON a.owner_id = u.id
        WHERE r.appointment_id = ?
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No rating found for this appointment'
        });
      }

      res.status(200).json({
        success: true,
        data: rows[0]
      });
    } catch (error) {
      console.error('Error fetching rating:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching rating'
      });
    }
  }
);

// Update appointment status
router.patch('/:id/status',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.updateAppointmentStatus
);

// Mark as waiting (with daily queue assignment)
router.post('/:id/waiting',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.markAsWaiting
);

// Session management
router.post('/:id/start-session',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.startAppointmentSession
);

router.post('/:id/end-session',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.endAppointmentSession
);

// Cancel appointment
router.patch('/:id/cancel',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.cancelAppointment
);

router.patch('/:id/cancel-with-reason',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.cancelAppointmentWithReason
);

// Update pricing
router.patch('/:id/pricing',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.updateAppointmentPricing
);

// Set actual schedule
router.patch('/:id/actual-schedule',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.setActualSchedule
);

// Update notes
router.patch('/:id/notes',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.updateAppointmentNotes
);

// Mark as no show
router.patch('/:id/no-show',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.markAsNoShow
);

// ===================
// PAYMENT ROUTES
// ===================

// Payment management
router.post('/:id/payment/cash',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.processCashPayment
);

router.patch('/:id/payment/mark-paid',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.markPaymentAsPaid
);

router.post('/:id/payment/gcash',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.initiateGCashPayment
);

router.get('/:id/payments',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAppointmentPayments
);

// GCash webhook
router.post('/webhook/gcash',
  ownerAppointmentController.gcashPaymentWebhook
);

// ===================
// FINAL ROUTE - GET APPOINTMENT DETAILS
// ===================

router.get('/:id',
  authMiddleware.verifyToken,
  verifyOwner,
  ownerAppointmentController.getAppointmentDetails
);

module.exports = router;