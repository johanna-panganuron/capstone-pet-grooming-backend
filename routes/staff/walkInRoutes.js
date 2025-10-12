// routes/staff/walkInRoutes.js
const express = require('express');
const router = express.Router();
const StaffWalkInController = require('../../controllers/staff/walkInController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/grooming-photos/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(
      null,
      `${req.params.bookingId}-${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, JPG and PNG files are allowed'));
    }
  }
});

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(authorize(['staff'])); // Only staff can access walk-in features

// ============= SEARCH ROUTES =============
// Search pet owners
router.get('/search/owners', StaffWalkInController.searchPetOwners);

// Search pets (with optional owner filter)
router.get('/search/pets', StaffWalkInController.searchPets);

// ============= PET OWNER & PETS ROUTES =============
// Get pets by specific owner ID
router.get('/owners/:ownerId/pets', StaffWalkInController.getPetsByOwner);

// Get active appointments (both regular appointments and walk-ins)
router.get('/active-appointments', StaffWalkInController.getActiveAppointments);

// ============= SERVICE ROUTES =============
// Get all available grooming services
router.get('/services', StaffWalkInController.getGroomingServices);

// Get service price for specific pet size
router.get('/services/:serviceId/price/:petSize', StaffWalkInController.getServicePrice);

// ============= GROOMER ROUTES =============
// Get all available groomers
router.get('/groomers', StaffWalkInController.getAvailableGroomers);

// ============= BOOKING ROUTES =============
// Create new walk-in booking
router.post('/bookings', StaffWalkInController.createWalkInBooking);

// Get all today's walk-in bookings
router.get('/bookings/today/all', StaffWalkInController.getTodayWalkInBookings);

// Get yesterday's walk-in bookings
router.get('/bookings/yesterday', StaffWalkInController.getYesterdayWalkInBookings);

// Get historical walk-in bookings
router.get('/bookings/history', StaffWalkInController.getHistoryWalkInBookings);

// Get booked time slots
router.get('/booked-slots', StaffWalkInController.getBookedTimeSlots);

// Upload photos for booking
router.post(
  '/bookings/:bookingId/upload-photos',
  upload.fields([
    { name: 'before_photo', maxCount: 1 },
    { name: 'after_photo', maxCount: 1 }
  ]),
  StaffWalkInController.uploadGroomingPhotos
);

// Add services to booking
router.patch('/bookings/:bookingId/add-services', StaffWalkInController.addServicesToBooking);

// Update booking status (pending, in_progress, completed, cancelled)
router.patch('/bookings/:bookingId/status', StaffWalkInController.updateBookingStatus);

// Update booking groomer
router.patch('/bookings/:bookingId/groomer', StaffWalkInController.updateBookingGroomer);

// Reschedule time slot
router.patch('/bookings/:bookingId/reschedule-time', StaffWalkInController.rescheduleWalkInTimeSlot);

// Cancel booking
router.patch('/bookings/:bookingId/cancel', StaffWalkInController.cancelBooking);

// Generate and download receipt PDF
router.get('/bookings/:bookingId/receipt/pdf', StaffWalkInController.generateReceipt);

// Get specific booking details
router.get('/bookings/:bookingId', StaffWalkInController.getWalkInBookingById);

// ============= SESSION MANAGEMENT ROUTES =============
// Start grooming session
router.post('/bookings/:bookingId/start-session', StaffWalkInController.startGroomingSession);

// End grooming session
router.post('/bookings/:bookingId/end-session', StaffWalkInController.endGroomingSession);

// Get session details
router.get('/bookings/:bookingId/session', StaffWalkInController.getSessionDetails);

// ============= DASHBOARD ROUTES =============
// Get dashboard statistics (today's stats)
router.get('/dashboard/stats', StaffWalkInController.getDashboardStats);

module.exports = router;