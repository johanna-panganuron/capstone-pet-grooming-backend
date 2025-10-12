// utils/activityLogger.js
const fs = require('fs').promises;
const path = require('path');
const db = require('../models/db'); // Add this import

class ActivityLogger {
  static async log(user, action, target_type, target_name, details, req = null) {
    const now = new Date();
    const activity = {
      timestamp: now.toISOString(),
      user_id: user.id,
      user_name: user.name,
      user_role: user.role,
      staff_type: user.staff_type || null,
      action,
      target_type,
      target_name,
      details,
      ip_address: req ? (req.ip || req.connection.remoteAddress) : null,
      user_agent: req ? req.get('User-Agent') : null
    };

    // Format console log with proper Philippine time
    const readableTime = now.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    console.log(`[ACTIVITY] ${readableTime} - ${user.name} (${user.role}${user.staff_type ? ` - ${user.staff_type}` : ''}) ${action}: ${target_name}`);

    // Save to database
    try {
      await db.execute(`
        INSERT INTO activity_logs (
          user_id, user_name, user_role, staff_type, action, 
          target_type, target_name, details, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        activity.user_id,
        activity.user_name,
        activity.user_role,
        activity.staff_type,
        activity.action,
        activity.target_type,
        activity.target_name,
        activity.details,
        activity.ip_address,
        activity.user_agent
      ]);
    } catch (dbError) {
      console.error('Failed to save activity to database:', dbError);
    }

    // Log to file (existing functionality)
    try {
      const logDir = path.join(process.cwd(), 'logs');
      await fs.mkdir(logDir, { recursive: true });
      
      const logFile = path.join(logDir, `activities-${now.toISOString().split('T')[0]}.log`);
      await fs.appendFile(logFile, JSON.stringify(activity) + '\n');
    } catch (error) {
      console.error('Failed to write activity log file:', error);
    }
  }
}

module.exports = { ActivityLogger };