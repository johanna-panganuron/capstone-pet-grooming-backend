// controllers/owner/staffController.js - Updated with Activity Logging
const db = require('../../models/db');
const bcrypt = require('bcryptjs');
const { ActivityLogger } = require('../../utils/activityLogger');

// Add Staff (Fixed to handle Groomer without password)
exports.addStaff = async (req, res) => {
  try {
    const { name, email, contact_number, staff_type } = req.body;
    let { password } = req.body;
    const profile_photo_url = req.file ? `/uploads/${req.file.filename}` : null;

    // Check if email already exists
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Email is already in use' });
    }

    // Only hash password for Receptionists
    let hashedPassword = null;
    if (staff_type === 'Receptionist' && password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const [result] = await db.query(
      `INSERT INTO users (name, email, password, contact_number, role, staff_type, profile_photo_url, status) 
       VALUES (?, ?, ?, ?, 'staff', ?, ?, 'Active')`,
      [name, email, hashedPassword, contact_number, staff_type, profile_photo_url]
    );

    // ✅ Log owner activity with actual owner name
    await ActivityLogger.log(
      req.user, // Contains actual owner info: "John Smith" not "Owner"
      'staff_create',
      'user',
      name,
      `Created new ${staff_type} account: ${name} (${email})`,
      req
    );

    res.status(201).json({ message: 'Staff account created successfully' });
  } catch (err) {
    console.error('Add staff error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getGroomers = async (req, res) => {
  try {
    // Simple debug query first
    const [debugRows] = await db.query(
      `SELECT COUNT(*) as count FROM users 
       WHERE role = 'staff' AND staff_type = 'Groomer'`
    );
    console.log('Total groomers in DB:', debugRows[0].count);

    // Main query with relaxed conditions for debugging
    const [groomers] = await db.query(`
      SELECT 
        id,
        name,
        email,
        contact_number,
        profile_photo_url AS profile_picture,
        role,
        staff_type,
        status
      FROM users
      WHERE staff_type = 'Groomer'
      ORDER BY name ASC
    `);

    console.log('Raw groomer data:', groomers);

    if (groomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No groomers found',
        debug: {
          total_groomers: debugRows[0].count,
          active_groomers: groomers.length
        }
      });
    }

    res.json({
      success: true,
      data: groomers.map(g => ({
        ...g,
        profile_picture: g.profile_picture 
          ? g.profile_picture.startsWith('http')
            ? g.profile_picture
            : `http://localhost:3000${g.profile_picture}`
          : null
      }))
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
};

// Get All Staff
exports.getAllStaff = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, email, contact_number, staff_type, status, profile_photo_url, created_at 
       FROM users 
       WHERE role = 'staff'
       ORDER BY created_at DESC`
    );

    res.json({ staff: rows });
  } catch (err) {
    console.error('Get all staff error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get Single Staff by ID
exports.getStaffById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT id, name, email, contact_number, staff_type, status, profile_photo_url, created_at 
       FROM users 
       WHERE id = ? AND role = 'staff'`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    res.json({ staff: rows[0] });
  } catch (err) {
    console.error('Get staff by ID error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update Staff Info (Fixed to handle email validation and password logic)
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, contact_number, staff_type, status } = req.body;
    let { password } = req.body;
    
    // Get original staff info for logging
    const [originalStaff] = await db.query(
      'SELECT name, email, staff_type FROM users WHERE id = ? AND role = "staff"',
      [id]
    );
    
    if (originalStaff.length === 0) {
      return res.status(404).json({ message: 'Staff not found' });
    }
    
    // Check if email already exists for another user
    const [existingUser] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id != ?', 
      [email, id]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Email is already in use' });
    }

    // Handle profile photo
    let profile_photo_url = req.body.profile_photo_url;
    if (req.file) {
      profile_photo_url = `/uploads/${req.file.filename}`;
    }

    // Build update query
    let updateQuery = `UPDATE users SET name = ?, email = ?, contact_number = ?, staff_type = ?, status = ?`;
    let queryParams = [name, email, contact_number, staff_type, status];

    if (profile_photo_url) {
      updateQuery += `, profile_photo_url = ?`;
      queryParams.push(profile_photo_url);
    }

    // Handle password logic
    if (staff_type === 'Receptionist' && password) {
      // Hash new password for Receptionist
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password = ?`;
      queryParams.push(hashedPassword);
    } else if (staff_type === 'Groomer') {
      // Remove password for Groomer
      updateQuery += `, password = NULL`;
    }
    // If Receptionist with no password provided, keep existing password

    updateQuery += ` WHERE id = ? AND role = 'staff'`;
    queryParams.push(id);

    const [result] = await db.query(updateQuery, queryParams);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Staff not found or not updated' });
    }

    // ✅ Log owner update activity with actual owner name
    const changes = [];
    if (originalStaff[0].name !== name) changes.push(`name: "${originalStaff[0].name}" → "${name}"`);
    if (originalStaff[0].email !== email) changes.push(`email: "${originalStaff[0].email}" → "${email}"`);
    if (originalStaff[0].staff_type !== staff_type) changes.push(`type: "${originalStaff[0].staff_type}" → "${staff_type}"`);
    if (password) changes.push('password updated');
    if (req.file) changes.push('profile photo updated');
    
    await ActivityLogger.log(
      req.user,
      'staff_update',
      'user',
      name,
      `Updated staff member: ${changes.length > 0 ? changes.join(', ') : 'no changes detected'}`,
      req
    );

    res.json({ message: 'Staff updated successfully' });
  } catch (err) {
    console.error('Update staff error:', err);
    
    // Handle MySQL duplicate entry error
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email is already in use' });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update Staff Status (Fixed)
exports.updateStaffStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Active', 'Fired', 'Resigned'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    // Get staff info for logging
    const [staff] = await db.query(
      'SELECT name, status as old_status FROM users WHERE id = ? AND role = "staff"',
      [id]
    );
    
    if (staff.length === 0) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    const [result] = await db.query(
      `UPDATE users SET status = ? WHERE id = ? AND role = 'staff'`,
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    // ✅ Log owner status change activity
    await ActivityLogger.log(
      req.user,
      'staff_status_update',
      'user',
      staff[0].name,
      `Changed status from "${staff[0].old_status}" to "${status}"`,
      req
    );

    res.json({ message: `Staff status updated to ${status} successfully` });
  } catch (err) {
    console.error('Update staff status error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete Staff Permanently
exports.deleteStaffPermanently = async (req, res) => {
  try {
    const { id } = req.params;

    // Get staff info for logging
    const [staff] = await db.query(
      'SELECT name, email FROM users WHERE id = ? AND role = "staff"',
      [id]
    );
    
    if (staff.length === 0) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    const [result] = await db.query(
      `DELETE FROM users WHERE id = ? AND role = 'staff'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    // Log owner delete activity
    await ActivityLogger.log(
      req.user,
      'staff_delete',
      'user',
      staff[0].name,
      `Permanently deleted staff member: ${staff[0].name} (${staff[0].email})`,
      req
    );

    res.json({ message: 'Staff deleted permanently' });
  } catch (err) {
    console.error('Delete staff error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};