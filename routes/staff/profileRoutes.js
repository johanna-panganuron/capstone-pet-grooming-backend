// Create a new file: routes/staff/profileRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/authMiddleware');
const db = require('../../models/db');

// Get staff profile
router.get('/profile',
  authMiddleware.verifyToken,
  authMiddleware.authorize('staff'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      console.log('Staff profile requested for user ID:', userId);
      
      const [rows] = await db.execute(`
        SELECT 
          id,
          name,
          email,
          contact_number,
          role,
          staff_type,
          profile_photo_url,
          status,
          created_at
        FROM users 
        WHERE id = ? AND role = 'staff'
      `, [userId]);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
      }

      const user = rows[0];
      console.log('Staff profile found:', { id: user.id, name: user.name, role: user.role });

      res.status(200).json({
        success: true,
        id: user.id,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          contact_number: user.contact_number,
          role: user.role,
          staff_type: user.staff_type,
          profile_photo_url: user.profile_photo_url,
          status: user.status,
          created_at: user.created_at
        }
      });

    } catch (error) {
      console.error('Error fetching staff profile:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching profile',
        error: error.message
      });
    }
  }
);

// Update staff profile
router.put('/profile',
  authMiddleware.verifyToken,
  authMiddleware.authorize('staff'),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, email, contact_number } = req.body;

      const [result] = await db.execute(`
        UPDATE users 
        SET name = ?, email = ?, contact_number = ?, updated_at = NOW()
        WHERE id = ? AND role = 'staff'
      `, [name, email, contact_number, userId]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
      }

      // Fetch updated profile
      const [rows] = await db.execute(`
        SELECT id, name, email, contact_number, role, staff_type, status
        FROM users 
        WHERE id = ?
      `, [userId]);

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: rows[0]
      });

    } catch (error) {
      console.error('Error updating staff profile:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile',
        error: error.message
      });
    }
  }
);

module.exports = router;