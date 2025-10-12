// routes\appointmentRoutes.js (pet_owner)
const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middleware/authMiddleware');
const Rating = require('../models/Rating'); // Add Rating model import
const db = require('../models/db'); 
const path = require('path');
const fs = require('fs');

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

// CREATE APPOINTMENT
router.post('/',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.createAppointment
);

// GET ALL MY APPOINTMENTS (with payment status)
router.get('/',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getMyAppointments
);

// GET BOOKED SLOTS FOR SPECIFIC DATE
router.get('/booked-slots',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getBookedSlots
);

// GET UPCOMING APPOINTMENTS
router.get('/upcoming',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getUpcomingAppointments
);

// GET APPOINTMENT HISTORY
router.get('/history',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getAppointmentHistory
);

// GET AVAILABLE SERVICES
router.get('/services/available',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getAvailableServices
);

// GET AVAILABLE TIME SLOTS
router.get('/time-slots',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getAvailableTimeSlots
);

// GET SINGLE APPOINTMENT BY ID (with payment info)
router.get('/:id',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getAppointmentById
);
router.get('/stats/spending',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.getSpendingStats
);
// GET APPOINTMENT IMAGES
router.get('/:id/images',
  authMiddleware.verifyToken,
  verifyPetOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verify appointment belongs to this pet owner
      const [rows] = await db.execute(
        'SELECT id, owner_id, before_image, after_image, upload_notes, has_images FROM appointments WHERE id = ? AND owner_id = ?',
        [id, userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found or access denied'
        });
      }

      const appointment = rows[0];

      if (!appointment.has_images) {
        return res.status(404).json({
          success: false,
          message: 'No images available for this appointment'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          appointmentId: appointment.id,
          hasImages: appointment.has_images,
          beforeImage: appointment.before_image,
          afterImage: appointment.after_image,
          notes: appointment.upload_notes
        }
      });

    } catch (error) {
      console.error('Error fetching appointment images:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching appointment images',
        error: error.message
      });
    }
  }
);

// SUBMIT RATING FOR APPOINTMENT
router.post('/:id/rating',
  authMiddleware.verifyToken,
  verifyPetOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { rating, review, aspects } = req.body;

      console.log(`Creating rating for appointment ${id} by user ${userId}`);

      // Validate required fields
      if (!rating) {
        return res.status(400).json({
          success: false,
          message: 'Rating is required'
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }

      // Verify appointment belongs to this user and is completed
      const [appointmentRows] = await db.execute(
        'SELECT id, owner_id, status FROM appointments WHERE id = ? AND owner_id = ?',
        [id, userId]
      );

      if (appointmentRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found or access denied'
        });
      }

      const appointment = appointmentRows[0];
      if (appointment.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'You can only rate completed appointments'
        });
      }

      const ratingData = {
        appointment_id: parseInt(id),
        customer_id: userId,
        rating: parseInt(rating),
        review: review?.trim() || null,
        aspects: aspects || {}
      };

      const ratingId = await Rating.create(ratingData);
      const createdRating = await Rating.findById(ratingId);

      console.log('✅ Rating created successfully:', ratingId);

      res.status(201).json({
        success: true,
        message: 'Rating submitted successfully',
        data: {
          rating_id: ratingId,
          rating: createdRating
        }
      });

    } catch (error) {
      console.error('❌ Error creating appointment rating:', error);
      
      let statusCode = 500;
      let message = 'Failed to submit rating';

      if (error.message.includes('already exists')) {
        statusCode = 409;
        message = 'You have already rated this appointment';
      } else if (error.message.includes('Missing required fields')) {
        statusCode = 400;
        message = error.message;
      }

      res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// ✅ NEW: GET RATING FOR APPOINTMENT
router.get('/:id/rating',
  authMiddleware.verifyToken,
  verifyPetOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      console.log(`🔍 Getting rating for appointment ${id} by user ${userId}`);

      // Verify appointment belongs to this user
      const [appointmentRows] = await db.execute(
        'SELECT id, owner_id FROM appointments WHERE id = ? AND owner_id = ?',
        [id, userId]
      );

      if (appointmentRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found or access denied'
        });
      }

      const rating = await Rating.findByAppointment(id);

      if (!rating) {
        return res.status(404).json({
          success: false,
          message: 'No rating found for this appointment',
          data: null
        });
      }

      res.json({
        success: true,
        data: rating
      });

    } catch (error) {
      console.error('❌ Error getting appointment rating:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get appointment rating',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// ✅ NEW: UPDATE RATING FOR APPOINTMENT
router.put('/:id/rating',
  authMiddleware.verifyToken,
  verifyPetOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { rating, review, aspects } = req.body;

      console.log(`📝 Updating rating for appointment ${id} by user ${userId}`);

      // Verify appointment belongs to this user
      const [appointmentRows] = await db.execute(
        'SELECT id, owner_id FROM appointments WHERE id = ? AND owner_id = ?',
        [id, userId]
      );

      if (appointmentRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found or access denied'
        });
      }

      // Find existing rating
      const existingRating = await Rating.findByAppointment(id);
      if (!existingRating) {
        return res.status(404).json({
          success: false,
          message: 'No rating found for this appointment'
        });
      }

      // Prepare update data
      const updateData = {};
      
      if (rating !== undefined) {
        if (rating < 1 || rating > 5) {
          return res.status(400).json({
            success: false,
            message: 'Rating must be between 1 and 5'
          });
        }
        updateData.rating = parseInt(rating);
      }

      if (review !== undefined) {
        updateData.review = review?.trim() || null;
      }

      if (aspects) {
        if (aspects.staff !== undefined) updateData.staff_rating = aspects.staff;
        if (aspects.service !== undefined) updateData.service_rating = aspects.service;
        if (aspects.cleanliness !== undefined) updateData.cleanliness_rating = aspects.cleanliness;
        if (aspects.value !== undefined) updateData.value_rating = aspects.value;
      }

      const success = await Rating.update(existingRating.id, updateData);

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to update rating'
        });
      }

      // Get updated rating
      const updatedRating = await Rating.findById(existingRating.id);

      res.json({
        success: true,
        message: 'Rating updated successfully',
        data: updatedRating
      });

    } catch (error) {
      console.error('❌ Error updating appointment rating:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update rating',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// ✅ NEW: DELETE RATING FOR APPOINTMENT
router.delete('/:id/rating',
  authMiddleware.verifyToken,
  verifyPetOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      console.log(`🗑️ Deleting rating for appointment ${id} by user ${userId}`);

      // Verify appointment belongs to this user
      const [appointmentRows] = await db.execute(
        'SELECT id, owner_id FROM appointments WHERE id = ? AND owner_id = ?',
        [id, userId]
      );

      if (appointmentRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found or access denied'
        });
      }

      // Find existing rating
      const existingRating = await Rating.findByAppointment(id);
      if (!existingRating) {
        return res.status(404).json({
          success: false,
          message: 'No rating found for this appointment'
        });
      }

      const success = await Rating.delete(existingRating.id);

      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to delete rating'
        });
      }

      res.json({
        success: true,
        message: 'Rating deleted successfully'
      });

    } catch (error) {
      console.error('❌ Error deleting appointment rating:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete rating',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

router.get('/images/:filename',
  async (req, res) => {
    try {
      const { filename } = req.params;
      
      // Determine the correct uploads path based on your project structure
      // Adjust this path according to where your uploads folder is located
      const uploadsPath = path.join(process.cwd(), 'uploads', 'appointments');
      const imagePath = path.join(uploadsPath, filename);
      
      console.log('📸 Looking for image at:', imagePath);

      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        console.log('❌ Image not found at:', imagePath);
        console.log('📁 Directory contents:', fs.readdirSync(uploadsPath).slice(0, 10)); // Show first 10 files
        
        return res.status(404).json({
          success: false,
          message: 'Image not found',
          debug: {
            requestedFile: filename,
            searchPath: imagePath,
            uploadsDir: uploadsPath,
            dirExists: fs.existsSync(uploadsPath)
          }
        });
      }

      // Determine content type
      const ext = path.extname(filename).toLowerCase();
      const contentTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };

      // Set appropriate headers
      res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      console.log('✅ Serving image:', imagePath);
      // Send file using absolute path
      res.sendFile(path.resolve(imagePath));

    } catch (error) {
      console.error('❌ Error serving image:', error);
      res.status(500).json({
        success: false,
        message: 'Error serving image',
        error: error.message
      });
    }
  }
);

// RESCHEDULE APPOINTMENT
router.put('/:id/reschedule',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.rescheduleAppointment
);

// UPDATE APPOINTMENT (limited fields, consider payment status)
router.put('/:id',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.updateAppointment
);

// CANCEL APPOINTMENT (handle payment refunds if needed)
router.patch('/:id/cancel',
  authMiddleware.verifyToken,
  verifyPetOwner,
  appointmentController.cancelAppointment
);

module.exports = router;