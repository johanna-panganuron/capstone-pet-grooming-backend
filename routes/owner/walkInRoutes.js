// routes/owner/walkInRoutes.js
const express = require('express');
const router = express.Router();
const WalkInController = require('../../controllers/owner/walkInController');
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
router.use(authorize(['staff', 'owner'])); // Only staff and owner can access walk-in features

// ============= SEARCH ROUTES =============
// Search pet owners
router.get('/search/owners', WalkInController.searchPetOwners);

// Search pets (with optional owner filter)
router.get('/search/pets', WalkInController.searchPets);

// ============= PET OWNER & PETS ROUTES =============
// Get pets by specific owner ID
router.get('/owners/:ownerId/pets', WalkInController.getPetsByOwner);

// Get active appointments (both regular appointments and walk-ins)
router.get('/active-appointments', WalkInController.getActiveAppointments);

// ============= SERVICE ROUTES =============
// Get all available grooming services
router.get('/services', WalkInController.getGroomingServices);

// Get service price for specific pet size
router.get('/services/:serviceId/price/:petSize', WalkInController.getServicePrice);

// ============= GROOMER ROUTES =============
// Get all available groomers
router.get('/groomers', WalkInController.getAvailableGroomers);

// ============= BOOKING ROUTES =============
// Create new walk-in booking
router.post('/bookings', WalkInController.createWalkInBooking);

// Get all today's walk-in bookings
router.get('/bookings/today/all', WalkInController.getTodayWalkInBookings);

// Get yesterday's walk-in bookings
router.get('/bookings/yesterday', WalkInController.getYesterdayWalkInBookings);

// Get walk-in bookings history
router.get('/bookings/history', WalkInController.getHistoryWalkInBookings);

// Get booked time slots
router.get('/booked-slots', WalkInController.getBookedTimeSlots);

// Upload photos for booking
router.post(
  '/bookings/:bookingId/upload-photos',
  upload.fields([
    { name: 'before_photo', maxCount: 1 },
    { name: 'after_photo', maxCount: 1 }
  ]),
  WalkInController.uploadGroomingPhotos
);

// Add services to booking
router.patch('/bookings/:bookingId/add-services', WalkInController.addServicesToBooking);

// Update booking status (pending, in_progress, completed, cancelled)
router.patch('/bookings/:bookingId/status', WalkInController.updateBookingStatus);

// Update booking groomer
router.patch('/bookings/:bookingId/groomer', WalkInController.updateBookingGroomer);

// Reschedule time slot
router.patch('/bookings/:bookingId/reschedule-time', WalkInController.rescheduleWalkInTimeSlot);

// Cancel booking
router.patch('/bookings/:bookingId/cancel', WalkInController.cancelBooking);

// Generate and download receipt PDF
router.get('/bookings/:bookingId/receipt/pdf', WalkInController.generateReceipt);

// Send receipt via email
router.post('/bookings/:bookingId/receipt/email', WalkInController.sendReceipt);

// Get specific booking details
router.get('/bookings/:bookingId', WalkInController.getWalkInBookingById);

// ============= RATING ROUTES =============
// Get all walk-in ratings with pagination and filters
router.get('/ratings', WalkInController.getAllWalkInRatings);

// Get walk-in rating statistics and distribution
router.get('/ratings/stats', WalkInController.getWalkInRatingStats);

// Get rating for a specific booking
router.get('/bookings/:bookingId/rating', WalkInController.getBookingRating);

// ============= SESSION MANAGEMENT ROUTES =============
// Start grooming session
router.post('/bookings/:bookingId/start-session', WalkInController.startGroomingSession);

// End grooming session
router.post('/bookings/:bookingId/end-session', WalkInController.endGroomingSession);

// Get session details
router.get('/bookings/:bookingId/session', WalkInController.getSessionDetails);

// ============= DASHBOARD ROUTES =============
// Get dashboard statistics (today's stats)
router.get('/dashboard/stats', WalkInController.getDashboardStats);

module.exports = router;