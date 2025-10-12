// controllers/owner/notificationController.js
const Notification = require('../../models/Notification');

class OwnerNotificationController {
  // Get owner notifications
  async getOwnerNotifications(req, res) {
    try {
      const ownerId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const result = await Notification.getUserNotifications(
        ownerId, 
        parseInt(page), 
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error getting owner notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  // Get unread count for owner
  async getUnreadCount(req, res) {
    try {
      const ownerId = req.user.id;
      const count = await Notification.getUnreadCount(ownerId);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('Error getting owner unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  }

  // Mark notification as read for owner
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const ownerId = req.user.id;

      const success = await Notification.markAsRead(id, ownerId);

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

  // Mark all as read for owner
  async markAllAsRead(req, res) {
    try {
      const ownerId = req.user.id;
      const count = await Notification.markAllAsRead(ownerId);

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

  // Delete notification for owner
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const ownerId = req.user.id;

      const success = await Notification.delete(id, ownerId);

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

  // Create notification for owner (system notifications)
  async createOwnerNotification(req, res) {
    try {
      const { title, message, type = 'system' } = req.body;
      const ownerId = req.user.id;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          message: 'Title and message are required'
        });
      }

      const notification = await Notification.create(ownerId, title, message, type);

      res.status(201).json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('Error creating owner notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification'
      });
    }
  }
}

module.exports = new OwnerNotificationController();