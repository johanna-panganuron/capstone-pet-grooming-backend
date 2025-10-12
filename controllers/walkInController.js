// controllers/walkInController.js (pet_owner/customer)
const WalkInBooking = require('../models/WalkInBooking');


class CustomerWalkInController {
  // Get customer's walk-in bookings (today's active and recent history)
  static async getMyWalkInBookings(req, res) {
    try {
      console.log('=== GET MY WALK-IN BOOKINGS ===');
      console.log('Customer ID:', req.user.id);
      
      const customerId = req.user.id;
      
      const bookings = await WalkInBooking.getCustomerWalkInBookings(customerId);
      console.log(`Found ${bookings.length} walk-in bookings for customer ${customerId}`);
      
      res.json({
        success: true,
        message: `Found ${bookings.length} walk-in bookings`,
        data: bookings
      });
    } catch (error) {
      console.error('Error getting customer walk-in bookings:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get walk-in bookings',
        error: error.message 
      });
    }
  }

  // Get specific walk-in booking details (only if it belongs to the customer)
  static async getMyWalkInBookingById(req, res) {
    try {
      console.log('=== GET MY WALK-IN BOOKING DETAILS ===');
      console.log('Customer ID:', req.user.id);
      console.log('Booking ID:', req.params.bookingId);
      
      const { bookingId } = req.params;
      const customerId = req.user.id;
      
      const booking = await WalkInBooking.getCustomerWalkInBookingById(bookingId, customerId);
      
      if (!booking) {
        return res.status(404).json({ 
          success: false,
          message: 'Booking not found or you do not have permission to view it' 
        });
      }
      
      console.log(`Found booking for ${booking.owner_name} - ${booking.pet_name}`);
      
      res.json({
        success: true,
        message: 'Booking details retrieved successfully',
        data: booking
      });
    } catch (error) {
      console.error('Error getting booking details:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get booking details',
        error: error.message 
      });
    }
  }

  // Get customer's today walk-in bookings only
  static async getMyTodayWalkInBookings(req, res) {
    try {
      console.log('=== GET MY TODAY\'S WALK-IN BOOKINGS ===');
      console.log('Customer ID:', req.user.id);
      
      const customerId = req.user.id;
      
      const bookings = await WalkInBooking.getCustomerTodayWalkInBookings(customerId);
      console.log(`Found ${bookings.length} today's walk-in bookings for customer ${customerId}`);
      
      res.json({
        success: true,
        message: `Found ${bookings.length} bookings for today`,
        data: bookings
      });
    } catch (error) {
      console.error('Error getting today\'s walk-in bookings:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get today\'s walk-in bookings',
        error: error.message 
      });
    }
  }

  // Get customer's walk-in booking history
  static async getMyWalkInBookingHistory(req, res) {
    try {
      console.log('=== GET MY WALK-IN BOOKING HISTORY ===');
      console.log('Customer ID:', req.user.id);
      
      const customerId = req.user.id;
      const { page = 1, limit = 10 } = req.query;
      
      const result = await WalkInBooking.getCustomerWalkInBookingHistory(
        customerId, 
        parseInt(page), 
        parseInt(limit)
      );
      
      console.log(`Found ${result.bookings.length} historical bookings (Page ${page}/${result.totalPages})`);
      
      res.json({
        success: true,
        message: `Found ${result.bookings.length} historical bookings`,
        data: result.bookings,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalRecords: result.totalRecords,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      console.error('Error getting walk-in booking history:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get walk-in booking history',
        error: error.message 
      });
    }
  }

  // Get customer's pets (for context in bookings)
  static async getMyPets(req, res) {
    try {
      console.log('=== GET MY PETS ===');
      console.log('Customer ID:', req.user.id);
      
      const customerId = req.user.id;
      
      const pets = await WalkInBooking.getCustomerPets(customerId);
      console.log(`Found ${pets.length} pets for customer ${customerId}`);
      
      res.json({
        success: true,
        message: `Found ${pets.length} pets`,
        data: pets
      });
    } catch (error) {
      console.error('Error getting customer pets:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get pets',
        error: error.message 
      });
    }
  }

  // Check if customer has active walk-in booking today
  static async getMyActiveWalkInStatus(req, res) {
    try {
      console.log('=== GET MY ACTIVE WALK-IN STATUS ===');
      console.log('Customer ID:', req.user.id);
      
      const customerId = req.user.id;
      
      const activeBooking = await WalkInBooking.getCustomerActiveWalkInBooking(customerId);
      
      const hasActiveBooking = !!activeBooking;
      
      res.json({
        success: true,
        message: hasActiveBooking ? 'You have an active walk-in booking' : 'No active walk-in bookings',
        data: {
          has_active_booking: hasActiveBooking,
          active_booking: activeBooking
        }
      });
    } catch (error) {
      console.error('Error getting active walk-in status:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get active booking status',
        error: error.message 
      });
    }
  }

  // Get customer's walk-in booking statistics
  static async getMyWalkInStats(req, res) {
    try {
      console.log('=== GET MY WALK-IN STATS ===');
      console.log('Customer ID:', req.user.id);
      
      const customerId = req.user.id;
      
      const stats = await WalkInBooking.getCustomerWalkInStats(customerId);
      console.log('Customer walk-in stats:', stats);
      
      res.json({
        success: true,
        message: 'Walk-in statistics retrieved successfully',
        data: stats
      });
    } catch (error) {
      console.error('Error getting walk-in stats:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get walk-in statistics',
        error: error.message 
      });
    }
  }

  // Add this method to your CustomerWalkInController class

static async submitWalkInRating(req, res) {
    try {
      console.log('=== SUBMIT WALK-IN RATING ===');
      console.log('Customer ID:', req.user.id);
      console.log('Booking ID:', req.params.bookingId);
      console.log('Rating data:', req.body);
      
      const { bookingId } = req.params;
      const customerId = req.user.id;
      const { rating, review, aspects } = req.body;
      
      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }
      
      // Check if booking exists and belongs to customer
      const booking = await WalkInBooking.getCustomerWalkInBookingById(bookingId, customerId);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or you do not have permission to rate it'
        });
      }
      
      // Check if booking is completed
      if (booking.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'You can only rate completed bookings'
        });
      }
      
      // Check if rating already exists
      const existingRating = await WalkInBooking.getWalkInRating(bookingId);
      if (existingRating) {
        return res.status(400).json({
          success: false,
          message: 'You have already rated this booking'
        });
      }
      
      // Submit the rating
      const ratingData = {
        walk_in_booking_id: bookingId,
        customer_id: customerId,
        rating: rating,
        review: review?.trim() || null,
        staff_friendliness: aspects?.staff || null,
        service_quality: aspects?.service || null,
        cleanliness: aspects?.cleanliness || null,
        value_for_money: aspects?.value || null
      };
      
      const ratingId = await WalkInBooking.submitWalkInRating(ratingData);
      
      console.log(`Rating submitted successfully with ID: ${ratingId}`);
      
      res.json({
        success: true,
        message: 'Rating submitted successfully',
        data: {
          rating_id: ratingId,
          booking_id: bookingId,
          rating: rating
        }
      });
      
    } catch (error) {
      console.error('Error submitting walk-in rating:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit rating',
        error: error.message
      });
    }
  }
  
}

module.exports = CustomerWalkInController;