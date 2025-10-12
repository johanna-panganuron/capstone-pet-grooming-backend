// routes/notificationsRoutes.js (pet_owner)
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken, verifyPetOwner, verifyOwnerOrStaff } = require('../middleware/authMiddleware');

// Apply authentication to all routes
router.use(verifyToken);

// Pet owner routes - only pet owners can access their notifications
router.get('/', verifyPetOwner, notificationController.getUserNotifications);
router.get('/unread-count', verifyPetOwner, notificationController.getUnreadCount);
router.patch('/:id/read', verifyPetOwner, notificationController.markAsRead);
router.patch('/read-all', verifyPetOwner, notificationController.markAllAsRead);
router.delete('/:id', verifyPetOwner, notificationController.deleteNotification);

// Create notification (staff/owner only - they create notifications FOR pet owners)
router.post('/', 
  verifyOwnerOrStaff,
  notificationController.createNotification
);

module.exports = router;