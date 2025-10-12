// ===== controllers/owner/customerController.js =====
const db = require('../../models/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ActivityLogger } = require('../../utils/activityLogger');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/profiles/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// Export the upload middleware
exports.uploadProfilePhoto = upload.single('profile_photo');

// Get customer by ID
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const [customer] = await db.query(
      `SELECT id, name, email, contact_number, profile_photo_url, 
       created_at, updated_at FROM users WHERE id = ? AND role = 'pet_owner'`, 
      [id]
    );
    
    if (customer.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      customer: customer[0] 
    });
  } catch (err) {
    console.error('Error getting customer:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// ✅ Add New Walk-In Customer (FIXED)
exports.addCustomer = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    const { name, email, contact_number } = req.body;

    // Validate required fields
    if (!name || !email || !contact_number) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and contact number are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate contact number (11 digits starting with 09)
    const contactRegex = /^09\d{9}$/;
    if (!contactRegex.test(contact_number)) {
      return res.status(400).json({
        success: false,
        message: 'Contact number must be 11 digits starting with 09'
      });
    }

    // Check if email already exists
    const emailCheckQuery = 'SELECT id FROM users WHERE email = ?';
    const [existingUsers] = await db.query(emailCheckQuery, [email]);

    if (existingUsers.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    // Handle profile photo if uploaded
    let profilePhotoUrl = null;
    if (req.file) {
      profilePhotoUrl = `/uploads/profiles/${req.file.filename}`;
    }

    // Insert new walk-in customer (no password = walk-in)
    const insertQuery = `
      INSERT INTO users (name, email, contact_number, profile_photo_url, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pet_owner', NOW(), NOW())
    `;

    const [result] = await db.query(insertQuery, [
      name.trim(),
      email.trim().toLowerCase(),
      contact_number,
      profilePhotoUrl
    ]);

    // Get the newly created customer
    const customerQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.contact_number,
        u.profile_photo_url,
        u.created_at,
        CASE 
          WHEN u.oauth_provider IS NOT NULL THEN 'Online'
          WHEN u.password IS NOT NULL AND u.password != '' THEN 'Online'
          ELSE 'Walk In'
        END as customer_type,
        0 as total_pets,
        0 as total_visits
      FROM users u
      WHERE u.id = ?
    `;

    const [newCustomer] = await db.query(customerQuery, [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Walk-in customer added successfully',
      customer: newCustomer[0]
    });
// ✅ Activity Log
await ActivityLogger.log(
  req.user,
  'customer_create',
  'customer',
  name,
  `Added walk-in customer: ${name} (${email})`,
  req
);
  } catch (err) {
    console.error('Add customer error:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Handle duplicate email error
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    // Handle multer errors
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ✅ Update Customer (FIXED)
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, contact_number, remove_photo } = req.body;

    console.log('Update request body:', req.body);
    console.log('Update request file:', req.file);

    // Validate required fields
    if (!name || !email || !contact_number) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and contact number are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate contact number
    const contactRegex = /^09\d{9}$/;
    if (!contactRegex.test(contact_number)) {
      return res.status(400).json({
        success: false,
        message: 'Contact number must be 11 digits starting with 09'
      });
    }

    // Check if customer exists
    const customerQuery = 'SELECT * FROM users WHERE id = ? AND role = "pet_owner"';
    const [existingCustomer] = await db.query(customerQuery, [id]);

    if (existingCustomer.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if email is already used by another customer
    const emailCheckQuery = 'SELECT id FROM users WHERE email = ? AND id != ?';
    const [emailExists] = await db.query(emailCheckQuery, [email, id]);

    if (emailExists.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email is already in use by another customer'
      });
    }

    // Handle profile photo update
    let profilePhotoUrl = existingCustomer[0].profile_photo_url;
    
    // If new photo uploaded
    if (req.file) {
      // Delete old photo if exists
      if (profilePhotoUrl && fs.existsSync(`public${profilePhotoUrl}`)) {
        fs.unlinkSync(`public${profilePhotoUrl}`);
      }
      profilePhotoUrl = `/uploads/profiles/${req.file.filename}`;
    }
    
    // If photo removal requested
    if (remove_photo === 'true') {
      if (profilePhotoUrl && fs.existsSync(`public${profilePhotoUrl}`)) {
        fs.unlinkSync(`public${profilePhotoUrl}`);
      }
      profilePhotoUrl = null;
    }

    // Update customer
    const updateQuery = `
      UPDATE users 
      SET name = ?, email = ?, contact_number = ?, profile_photo_url = ?, updated_at = NOW()
      WHERE id = ?
    `;

    await db.query(updateQuery, [
      name.trim(),
      email.trim().toLowerCase(),
      contact_number,
      profilePhotoUrl,
      id
    ]);

    // Get updated customer data
    const updatedCustomerQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.contact_number,
        u.profile_photo_url,
        u.created_at,
        u.updated_at,
        CASE 
          WHEN u.oauth_provider IS NOT NULL THEN 'Online'
          WHEN u.password IS NOT NULL AND u.password != '' THEN 'Online'
          ELSE 'Walk In'
        END as customer_type
      FROM users u
      WHERE u.id = ?
    `;

    const [updatedCustomer] = await db.query(updatedCustomerQuery, [id]);

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer: updatedCustomer[0]
    });
// ✅ Activity Log
await ActivityLogger.log(
  req.user,
  'customer_update',
  'customer',
  name,
  `Updated customer information: ${name} (${email})`,
  req
);
  } catch (err) {
    console.error('Update customer error:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ✅ Delete Customer
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const customerQuery = 'SELECT * FROM users WHERE id = ? AND role = "pet_owner"';
    const [existingCustomer] = await db.query(customerQuery, [id]);

    if (existingCustomer.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Delete customer's profile photo if exists
    const profilePhotoUrl = existingCustomer[0].profile_photo_url;
    if (profilePhotoUrl && fs.existsSync(`public${profilePhotoUrl}`)) {
      fs.unlinkSync(`public${profilePhotoUrl}`);
    }

    // Delete all customer's pets first (foreign key constraint)
    await db.query('DELETE FROM pets WHERE user_id = ?', [id]);

    // Delete customer
    await db.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
// ✅ Activity Log
await ActivityLogger.log(
  req.user,
  'customer_delete',
  'customer',
  existingCustomer[0].name,
  `Deleted customer: ${existingCustomer[0].name} (${existingCustomer[0].email})`,
  req
);
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ✅ Get All Customers with Summary Data (Keep existing)
exports.getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', customer_type = '' } = req.query;
    const offset = (page - 1) * limit;

    // Build WHERE clause for filtering
    let whereClause = "WHERE u.role = 'pet_owner'";
    let queryParams = [];

    // Add search filter
    if (search) {
      whereClause += " AND (u.name LIKE ? OR u.email LIKE ? OR u.contact_number LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Add customer type filter
    if (customer_type) {
      if (customer_type === 'Online') {
        whereClause += " AND u.password IS NOT NULL AND u.password != ''";
      } else if (customer_type === 'Walk In') {
        whereClause += " AND (u.password IS NULL OR u.password = '')";
      }
    }

    // Main query to get customers with pet count
    const customersQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.contact_number,
        u.profile_photo_url,
        u.created_at,
        CASE 
          WHEN u.oauth_provider IS NOT NULL THEN 'Online'
          WHEN u.password IS NOT NULL AND u.password != '' THEN 'Online'
          ELSE 'Walk In'
        END as customer_type,
        COUNT(DISTINCT p.id) as total_pets,
        0 as total_visits
      FROM users u
      LEFT JOIN pets p ON u.id = p.user_id
      ${whereClause}
      GROUP BY u.id, u.name, u.email, u.contact_number, u.profile_photo_url, u.created_at
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN pets p ON u.id = p.user_id
      ${whereClause}
    `;

    const countParams = queryParams.slice(0, queryParams.length - 2);

    // Execute queries
    const [customers] = await db.query(customersQuery, queryParams);
    const [countResult] = await db.query(countQuery, countParams);

    const totalCustomers = countResult[0].total;
    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      success: true,
      message: 'Customers retrieved successfully',
      customers,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_customers: totalCustomers,
        limit: parseInt(limit)
      }
    });

  } catch (err) {
    console.error('Get all customers error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

// ✅ Get Customer Details with Pets (Updated with Total Spent)
exports.getCustomerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer basic info
    const customerQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.contact_number,
        u.profile_photo_url,
        u.created_at,
        CASE 
          WHEN u.oauth_provider IS NOT NULL THEN 'Online'
          WHEN u.password IS NOT NULL AND u.password != '' THEN 'Online'
          ELSE 'Walk In'
        END as customer_type
      FROM users u
      WHERE u.id = ? AND u.role = 'pet_owner'
    `;

    // Get customer's pets
    const petsQuery = `
      SELECT 
        p.id,
        p.name,
        p.breed,
        p.type as species,
        p.gender,
        p.weight,
        p.size,
        p.birth_date,
        p.age,
        p.photo_url,
        p.created_at as registered_date
      FROM pets p
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `;

    // Get total spent directly from appointments and walk-ins
    const totalSpentQuery = `
      SELECT 
        (
          COALESCE((SELECT SUM(total_amount) FROM appointments 
                    WHERE owner_id = ? AND status = 'completed' AND payment_status = 'paid'), 0) +
          COALESCE((SELECT SUM(total_amount) FROM walk_in_bookings 
                    WHERE owner_id = ? AND status = 'completed' AND payment_status = 'paid'), 0)
        ) as total_spent
    `;

    // Get total visits (completed appointments + walk-ins)
    const totalVisitsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE owner_id = ? AND status = 'completed') +
        (SELECT COUNT(*) FROM walk_in_bookings WHERE owner_id = ? AND status = 'completed') 
        as total_visits
    `;

    // Execute queries
    const [customers] = await db.query(customerQuery, [id]);
    const [pets] = await db.query(petsQuery, [id]);
    const [spentResult] = await db.query(totalSpentQuery, [id, id]);
    const [visitsResult] = await db.query(totalVisitsQuery, [id, id]);

    if (customers.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Customer not found' 
      });
    }

    // Calculate summary stats
    const totalPets = pets.length;
    const totalVisits = visitsResult[0].total_visits;
    const totalSpent = spentResult[0].total_spent;

    res.json({
      success: true,
      message: 'Customer details retrieved successfully',
      customer: {
        ...customers[0],
        total_pets: totalPets,
        total_visits: totalVisits,
        total_spent: parseFloat(totalSpent).toFixed(2)
      },
      pets,
      recent_appointments: []
    });

  } catch (err) {
    console.error('Get customer details error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};

// ✅ Get Customer Statistics (Keep existing)
exports.getCustomerStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_customers,
        COUNT(CASE WHEN u.password IS NOT NULL AND u.password != '' THEN 1 END) as online_customers,
        COUNT(CASE WHEN u.password IS NULL OR u.password = '' THEN 1 END) as walk_in_customers,
        COUNT(CASE WHEN u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_customers_this_month
      FROM users u
      WHERE u.role = 'pet_owner'
    `;

    const [stats] = await db.query(statsQuery);

    res.json({
      success: true,
      message: 'Customer statistics retrieved successfully',
      stats: stats[0]
    });

  } catch (err) {
    console.error('Get customer stats error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};