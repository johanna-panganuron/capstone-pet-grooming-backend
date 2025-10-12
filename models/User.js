// models/User.js
const db = require('./db');

class User {
  // Find all groomers
  static async findGroomers(options = {}) {
    try {
      let sql = `
        SELECT 
          id,
          name,
          email,
          contact_number,
          profile_photo_url,
          status,
          role,
          staff_type,
          created_at,
          updated_at
        FROM users 
        WHERE role = 'staff' 
        AND staff_type = 'Groomer'
      `;

      const params = [];

      // Add status filter
      if (options.status) {
        sql += ` AND status = ?`;
        params.push(options.status);
      }

      // Add active filter by default if not explicitly including inactive
      if (!options.include_inactive && !options.status) {
        sql += ` AND status = 'Active'`;
      }

      sql += ` ORDER BY name ASC`;

      const [rows] = await db.query(sql, params);

      console.log(`Found ${rows.length} groomers`);

      return rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.contact_number,  // Map contact_number to phone for consistency
        contact_number: row.contact_number,
        profile_picture: row.profile_photo_url,  // Map profile_photo_url to profile_picture
        profile_photo_url: row.profile_photo_url,
        status: row.status,
        role: row.role,
        staff_type: row.staff_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

    } catch (error) {
      console.error('Error finding groomers:', error);
      throw error;
    }
  }

  // Find user by ID
  static async findById(userId) {
    try {
      const sql = `
        SELECT 
          id, name, email, contact_number, profile_photo_url, 
          status, role, staff_type,
          created_at, updated_at
        FROM users 
        WHERE id = ?
      `;

      const [rows] = await db.query(sql, [userId]);

      if (rows.length === 0) {
        return null;
      }

      return rows[0];

    } catch (error) {
      console.error('❌ Error finding user by ID:', error);
      throw error;
    }
  }

  // Find all staff members
  static async findStaff(options = {}) {
    let sql = `
      SELECT 
        id, name, email, contact_number, profile_photo_url,
        role, staff_type, status, created_at
      FROM users 
      WHERE role = 'staff'
    `;

    const params = [];

    if (options.staff_type) {
      sql += ` AND staff_type = ?`;
      params.push(options.staff_type);
    }

    if (options.status) {
      sql += ` AND status = ?`;
      params.push(options.status);
    }

    sql += ` ORDER BY staff_type ASC, name ASC`;

    const [rows] = await db.query(sql, params);
    return rows;
  }

  // Find active groomers only
  static async findActiveGroomers() {
    const sql = `
      SELECT 
        id, name, email, contact_number, profile_photo_url,
        role, staff_type, status, created_at
      FROM users 
      WHERE role = 'staff' 
      AND staff_type = 'Groomer'
      AND status = 'Active'
      ORDER BY name ASC
    `;

    const [rows] = await db.query(sql);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.contact_number,
      contact_number: row.contact_number,
      profile_picture: row.profile_photo_url,
      profile_photo_url: row.profile_photo_url,
      status: row.status,
      role: row.role,
      staff_type: row.staff_type,
      created_at: row.created_at
    }));
  }

  // Find user by email
  static async findByEmail(email) {
    const sql = `
      SELECT 
        id, name, email, contact_number, password, profile_photo_url,
        role, staff_type, status, oauth_provider, oauth_id,
        created_at, updated_at
      FROM users 
      WHERE email = ?
    `;

    const [rows] = await db.query(sql, [email]);
    return rows[0] || null;
  }

  // Create new user
  static async create(userData) {
    const {
      name, email, password, contact_number, role,
      staff_type, status = 'Active', profile_photo_url,
      oauth_provider, oauth_id
    } = userData;

    const sql = `
      INSERT INTO users 
      (name, email, password, contact_number, role, staff_type, status, 
       profile_photo_url, oauth_provider, oauth_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(sql, [
      name, email, password, contact_number, role, staff_type, status,
      profile_photo_url, oauth_provider, oauth_id
    ]);

    return result.insertId;
  }

  // Update user
  static async update(userId, updateData) {
    const allowedFields = [
      'name', 'email', 'password', 'contact_number', 'role',
      'staff_type', 'status', 'profile_photo_url'
    ];

    const updateFields = [];
    const updateValues = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(updateData[key]);
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateValues.push(userId);

    const sql = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const [result] = await db.query(sql, updateValues);
    return result.affectedRows > 0;
  }

  // Get groomer statistics
  static async getGroomerStats(groomerId) {
    const sql = `
      SELECT 
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
        COUNT(CASE WHEN a.status = 'in_progress' THEN 1 END) as active_appointments,
        COUNT(CASE WHEN DATE(a.preferred_date) = CURDATE() THEN 1 END) as today_appointments,
        AVG(a.total_amount) as avg_service_amount
      FROM appointments a
      WHERE a.groomer_id = ?
    `;

    const [rows] = await db.query(sql, [groomerId]);
    return rows[0];
  }

  // Find groomers with current workload
  static async findGroomersWithWorkload() {
    const sql = `
      SELECT 
        u.id, u.name, u.email, u.contact_number,
        COUNT(a.id) as current_appointments,
        COUNT(CASE WHEN a.status = 'in_progress' THEN 1 END) as active_appointments,
        COUNT(CASE WHEN DATE(a.preferred_date) = CURDATE() THEN 1 END) as today_appointments
      FROM users u
      LEFT JOIN appointments a ON u.id = a.groomer_id 
        AND a.status IN ('confirmed', 'in_progress')
      WHERE u.role = 'staff' 
      AND u.staff_type = 'Groomer'
      AND u.status = 'Active'
      GROUP BY u.id, u.name, u.email, u.contact_number
      ORDER BY current_appointments ASC, u.name ASC
    `;

    const [rows] = await db.query(sql);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.contact_number,
      contact_number: row.contact_number,
      current_appointments: row.current_appointments,
      active_appointments: row.active_appointments,
      today_appointments: row.today_appointments
    }));
  }
}

module.exports = User;