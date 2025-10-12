// routes/owner/notificationsRoutes.js
const express = require('express');
const router = express.Router();
const ownerNotificationController = require('../../controllers/owner/notificationController');
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');

// Apply authentication to all routes
router.use(verifyToken);
router.use(verifyOwner);

// Owner notification routes - only owners can access their notifications
router.get('/', ownerNotificationController.getOwnerNotifications);
router.get('/unread-count', ownerNotificationController.getUnreadCount);
router.patch('/:id/read', ownerNotificationController.markAsRead);
router.patch('/read-all', ownerNotificationController.markAllAsRead);
router.delete('/:id', ownerNotificationController.deleteNotification);

// Create notification (for system notifications or self-notifications)
router.post('/', ownerNotificationController.createOwnerNotification);

module.exports = router;