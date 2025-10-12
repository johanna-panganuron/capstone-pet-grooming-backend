// routes/walkInRoutes.js (pet_owner/customer)
const express = require('express');
const router = express.Router();
const CustomerWalkInController = require('../controllers/walkInController');
const { verifyToken, verifyPetOwner } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(verifyPetOwner); // Only pet_owner role can access these routes

// ============= CUSTOMER WALK-IN BOOKING ROUTES (READ-ONLY) =============

// Get all customer's walk-in bookings (today's active + recent history)
router.get('/my-bookings', CustomerWalkInController.getMyWalkInBookings);

// Get customer's today walk-in bookings only
router.get('/my-bookings/today', CustomerWalkInController.getMyTodayWalkInBookings);

// Get customer's walk-in booking history with pagination
router.get('/my-bookings/history', CustomerWalkInController.getMyWalkInBookingHistory);

// Get specific walk-in booking details (only if it belongs to the customer)
router.get('/my-bookings/:bookingId', CustomerWalkInController.getMyWalkInBookingById);

// Rating submission for a booking)
router.post('/my-bookings/:bookingId/rating', CustomerWalkInController.submitWalkInRating);

// Check if customer has any active walk-in booking today
router.get('/my-active-status', CustomerWalkInController.getMyActiveWalkInStatus);

// Get customer's walk-in booking statistics
router.get('/my-stats', CustomerWalkInController.getMyWalkInStats);

// ============= CUSTOMER PETS ROUTES (READ-ONLY CONTEXT) =============

// Get customer's pets (for context in bookings)
router.get('/my-pets', CustomerWalkInController.getMyPets);

module.exports = router;