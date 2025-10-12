// ===== controllers/staff/customerController.js =====
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

// ✅ Add New Walk-In Customer
exports.addCustomer = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    const { name, email, contact_number } = req.body;

    // Validate required fields
    if (!name || !email || !contact_number) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'CREATE_FAILED',
        'CUSTOMER',
        name || 'Unknown Customer',
        'Failed to create customer - Missing required fields (name, email, or contact number)',
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Name, email, and contact number are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'CREATE_FAILED',
        'CUSTOMER',
        name,
        `Failed to create customer - Invalid email format: ${email}`,
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate contact number (11 digits starting with 09)
    const contactRegex = /^09\d{9}$/;
    if (!contactRegex.test(contact_number)) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'CREATE_FAILED',
        'CUSTOMER',
        name,
        `Failed to create customer - Invalid contact number format: ${contact_number}`,
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Contact number must be 11 digits starting with 09'
      });
    }

    // Check if email already exists
    const emailCheckQuery = 'SELECT id FROM users WHERE email = ?';
    const [existingUsers] = await db.query(emailCheckQuery, [email]);

    if (existingUsers.length > 0) {
      // Log duplicate email attempt
      await ActivityLogger.log(
        req.user,
        'CREATE_FAILED',
        'CUSTOMER',
        name,
        `Failed to create customer - Email already registered: ${email}`,
        req
      );

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

    // Log successful customer creation
    await ActivityLogger.log(
      req.user,
      'CREATED',
      'CUSTOMER',
      name.trim(),
      `Created walk-in customer | Email: ${email.trim().toLowerCase()} | Contact: ${contact_number} | ${profilePhotoUrl ? 'With photo' : 'No photo'}`,
      req
    );

    res.status(201).json({
      success: true,
      message: 'Walk-in customer added successfully',
      customer: newCustomer[0]
    });

  } catch (err) {
    console.error('Add customer error:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'CREATE_FAILED',
      'CUSTOMER',
      req.body.name || 'Unknown Customer',
      `Error creating customer: ${err.message}`,
      req
    );
    
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

// ✅ Update Customer
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, contact_number, remove_photo } = req.body;

    console.log('Update request body:', req.body);
    console.log('Update request file:', req.file);

    // Validate required fields
    if (!name || !email || !contact_number) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'CUSTOMER',
        `Customer ID: ${id}`,
        'Failed to update customer - Missing required fields (name, email, or contact number)',
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Name, email, and contact number are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'CUSTOMER',
        `Customer ID: ${id}`,
        `Failed to update customer - Invalid email format: ${email}`,
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Validate contact number
    const contactRegex = /^09\d{9}$/;
    if (!contactRegex.test(contact_number)) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'CUSTOMER',
        `Customer ID: ${id}`,
        `Failed to update customer - Invalid contact number format: ${contact_number}`,
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Contact number must be 11 digits starting with 09'
      });
    }

    // Check if customer exists
    const customerQuery = 'SELECT * FROM users WHERE id = ? AND role = "pet_owner"';
    const [existingCustomer] = await db.query(customerQuery, [id]);

    if (existingCustomer.length === 0) {
      // Log customer not found
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'CUSTOMER',
        `Customer ID: ${id}`,
        'Failed to update customer - Customer not found',
        req
      );

      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const currentCustomer = existingCustomer[0];

    // Check if email is already used by another customer
    const emailCheckQuery = 'SELECT id FROM users WHERE email = ? AND id != ?';
    const [emailExists] = await db.query(emailCheckQuery, [email, id]);

    if (emailExists.length > 0) {
      // Log duplicate email attempt
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'CUSTOMER',
        currentCustomer.name,
        `Failed to update customer - Email already in use by another customer: ${email}`,
        req
      );

      return res.status(409).json({
        success: false,
        message: 'Email is already in use by another customer'
      });
    }

    // Track changes for logging
    let changes = [];
    if (name.trim() !== currentCustomer.name) {
      changes.push(`Name: "${currentCustomer.name}" → "${name.trim()}"`);
    }
    if (email.trim().toLowerCase() !== currentCustomer.email) {
      changes.push(`Email: "${currentCustomer.email}" → "${email.trim().toLowerCase()}"`);
    }
    if (contact_number !== currentCustomer.contact_number) {
      changes.push(`Contact: "${currentCustomer.contact_number}" → "${contact_number}"`);
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
      changes.push('Photo: Updated');
    }
    
    // If photo removal requested
    if (remove_photo === 'true') {
      if (profilePhotoUrl && fs.existsSync(`public${profilePhotoUrl}`)) {
        fs.unlinkSync(`public${profilePhotoUrl}`);
      }
      profilePhotoUrl = null;
      changes.push('Photo: Removed');
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

    // Log successful update
    await ActivityLogger.log(
      req.user,
      'UPDATED',
      'CUSTOMER',
      name.trim(),
      `Updated customer profile | Changes: ${changes.length > 0 ? changes.join(', ') : 'No changes detected'}`,
      req
    );

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer: updatedCustomer[0]
    });

  } catch (err) {
    console.error('Update customer error:', err);
    
    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Log the error
    await ActivityLogger.log(
      req.user,
      'UPDATE_FAILED',
      'CUSTOMER',
      `Customer ID: ${req.params.id}`,
      `Error updating customer: ${err.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// ✅ Get All Customers with Summary Data (Staff can view and manage)
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

    // Build search criteria for logging
    let searchCriteria = [];
    if (search) searchCriteria.push(`Search: "${search}"`);
    if (customer_type) searchCriteria.push(`Type: ${customer_type}`);
    const criteriaDescription = searchCriteria.length > 0 ? searchCriteria.join(', ') : 'No filters';

 

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

// ✅ Get Customer Details with Pets
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

    // Execute queries
    const [customers] = await db.query(customerQuery, [id]);
    const [pets] = await db.query(petsQuery, [id]);

    if (customers.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Customer not found' 
      });
    }

    // ✅ Calculate total spent from bookings
    const totalSpentQuery = `
    SELECT COALESCE(
      (SELECT SUM(total_amount) 
       FROM walk_in_bookings 
       WHERE owner_id = ? 
       AND payment_status = 'paid' 
       AND status = 'completed'), 0
    ) + COALESCE(
      (SELECT SUM(total_amount) 
       FROM appointments 
       WHERE owner_id = ? 
       AND payment_status = 'paid' 
       AND status = 'completed'), 0
    ) as total_spent
  `;
  
  const [spentResult] = await db.query(totalSpentQuery, [id, id]);
  const totalSpent = spentResult[0].total_spent;
    // TODO: Implement visits count if you want (example placeholder)
    const totalVisits = 0; 

    // Response
    res.json({
      success: true,
      message: 'Customer details retrieved successfully',
      customer: {
        ...customers[0],
        total_pets: pets.length,
        total_visits: totalVisits,
        total_spent: parseFloat(totalSpent).toFixed(2)
      },
      pets,
      recent_appointments: [] // You can later add recent bookings here
    });

  } catch (err) {
    console.error('Get customer details error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
};


// ✅ Get Customer Statistics
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