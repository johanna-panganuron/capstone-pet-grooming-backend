// models/Notification.js - Updated with delete method
const db = require('./db');

class Notification {
  constructor() {
    this.io = null; // Will be set by the server
  }

  // Set the Socket.io instance
  setSocketIO(io) {
    this.io = io;
  }

  // Create a new notification
  async create(userId, title, message, type = 'general') {
    try {
      console.log('🔍 Notification.create DEBUG:');
      console.log('  - userId:', userId, typeof userId);
      console.log('  - title:', title, typeof title);
      console.log('  - message:', message, typeof message);
      console.log('  - type:', type, typeof type);
      console.log('  - type length:', type ? type.length : 'null');
      console.log('  - type value check:', JSON.stringify(type));
  
      const query = `
        INSERT INTO notifications (user_id, title, message, type) 
        VALUES (?, ?, ?, ?)
      `;
      
      console.log('🔍 Query params array:', [userId, title, message, type]);
      
      const [result] = await db.execute(query, [userId, title, message, type]);
      
      // Verify what was actually inserted
      const [verification] = await db.execute(
        'SELECT * FROM notifications WHERE id = ?', 
        [result.insertId]
      );
      
      console.log('🔍 Database verification - what was actually inserted:');
      console.log('  - ID:', verification[0].id);
      console.log('  - Type in DB:', JSON.stringify(verification[0].type));
      console.log('  - Type length in DB:', verification[0].type ? verification[0].type.length : 'null');
      
      const notification = {
        id: result.insertId,
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
        created_at: new Date().toISOString()
      };

      // Emit real-time notification via Socket.io
      if (this.io) {
        console.log(`📨 Emitting notification to user-${userId}:`, notification);
        
        // Emit to specific user room
        this.io.to(`user-${userId}`).emit('new-notification', {
            notification: notification
          });
      } else {
        console.warn('⚠️ Socket.io not available for notification emission');
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Get user notifications
  async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      const [notifications] = await db.execute(`
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [userId, limit, offset]);
      
      return notifications;
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw error;
    }
  }

  // Get unread count
  async getUnreadCount(userId) {
    try {
      const [result] = await db.execute(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
        [userId]
      );
      return result[0].count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }

  // Mark as read
  async markAsRead(id, userId) {
    try {
      const [result] = await db.execute(
        'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error marking as read:', error);
      throw error;
    }
  }

  // Mark all as read
  async markAllAsRead(userId) {
    try {
      const [result] = await db.execute(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
        [userId]
      );
      return result.affectedRows;
    } catch (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }
  }

  // Delete notification
  async delete(id, userId) {
    try {
      const [result] = await db.execute(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  // Delete all notifications for a user
  async deleteAllForUser(userId) {
    try {
      const [result] = await db.execute(
        'DELETE FROM notifications WHERE user_id = ?',
        [userId]
      );
      return result.affectedRows;
    } catch (error) {
      console.error('Error deleting all notifications for user:', error);
      throw error;
    }
  }

  // Get notification by ID and user
  async getByIdAndUser(id, userId) {
    try {
      const [notifications] = await db.execute(
        'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      return notifications[0] || null;
    } catch (error) {
      console.error('Error getting notification by ID and user:', error);
      throw error;
    }
  }

  // Delete old notifications (cleanup utility)
  async deleteOldNotifications(daysOld = 30) {
    try {
      const [result] = await db.execute(
        'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [daysOld]
      );
      return result.affectedRows;
    } catch (error) {
      console.error('Error deleting old notifications:', error);
      throw error;
    }
  }
}

module.exports = new Notification();