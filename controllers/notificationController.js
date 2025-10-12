// controllers/notificationController.js (pet_owner)
const Notification = require('../models/Notification');

class NotificationController {
  // Get user notifications
  async getUserNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const result = await Notification.getUserNotifications(
        userId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  // Get unread count
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const count = await Notification.getUnreadCount(userId);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  }

  // Mark notification as read
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const success = await Notification.markAsRead(id, userId);

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

  // Mark all as read
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      const count = await Notification.markAllAsRead(userId);

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

  // Delete notification
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const success = await Notification.delete(id, userId);

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

  // Create notification (for staff/admin)
  async createNotification(req, res) {
    try {
      const { user_id, title, message, type = 'general' } = req.body;

      if (!user_id || !title || !message) {
        return res.status(400).json({
          success: false,
          message: 'user_id, title, and message are required'
        });
      }

      const notification = await Notification.create(user_id, title, message, type);

      res.status(201).json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification'
      });
    }
  }
}

module.exports = new NotificationController();