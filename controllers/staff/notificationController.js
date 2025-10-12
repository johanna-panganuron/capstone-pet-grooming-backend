// controllers/staff/notificationController.js
const Notification = require('../../models/Notification');

class StaffNotificationController {
  async getStaffNotifications(req, res) {
    try {
      const staffId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const result = await Notification.getUserNotifications(
        staffId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting staff notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  async getUnreadCount(req, res) {
    try {
      const staffId = req.user.id;
      const count = await Notification.getUnreadCount(staffId);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Error getting staff unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  }

  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const staffId = req.user.id;

      const success = await Notification.markAsRead(id, staffId);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.json({
        success: true,
        message: 'Marked as read'
      });
    } catch (error) {
      console.error('Error marking as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark as read'
      });
    }
  }

  async markAllAsRead(req, res) {
    try {
      const staffId = req.user.id;
      const count = await Notification.markAllAsRead(staffId);

      res.json({
        success: true,
        message: `${count} notifications marked as read`
      });
    } catch (error) {
      console.error('Error marking all as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all as read'
      });
    }
  }

  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const staffId = req.user.id;

      const success = await Notification.delete(id, staffId);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }
  }

  async createStaffNotification(req, res) {
    try {
      const { title, message, type = 'system' } = req.body;
      const staffId = req.user.id;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          message: 'Title and message are required'
        });
      }

      const notification = await Notification.create(staffId, title, message, type);

      res.status(201).json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Error creating staff notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification'
      });
    }
  }
}

module.exports = new StaffNotificationController();