// routes/staff/notificationsRoutes.js
const express = require('express');
const router = express.Router();
const staffNotificationController = require('../../controllers/staff/notificationController');
const { verifyToken, verifyStaff } = require('../../middleware/authMiddleware');

router.use(verifyToken);
router.use(verifyStaff);

router.get('/', staffNotificationController.getStaffNotifications);
router.get('/unread-count', staffNotificationController.getUnreadCount);
router.patch('/:id/read', staffNotificationController.markAsRead);
router.patch('/read-all', staffNotificationController.markAllAsRead);
router.delete('/:id', staffNotificationController.deleteNotification);
router.post('/', staffNotificationController.createStaffNotification);

module.exports = router;