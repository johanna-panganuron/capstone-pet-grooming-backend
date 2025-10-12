// controllers\userController.js
const db = require('../models/db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ GET /api/users/:id 
exports.getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      // Added created_at to the SELECT statement
      'SELECT id, name, email, contact_number, profile_photo_url, role, created_at FROM users WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User fetched with created_at:', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching user by ID:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};
  
// ✅ Update user by ID (including optional password + photo)
exports.updateUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {};
    
    console.log('=== UPDATE USER DEBUG START ===');
    console.log('User ID:', id);
    console.log('Request body:', req.body);
    console.log('Files received:', req.files);
    console.log('Single file received:', req.file);
    console.log('=== UPDATE USER DEBUG END ===');
    
    // Handle text fields
    if (req.body.name) updates.name = req.body.name;
    if (req.body.email) updates.email = req.body.email;
    if (req.body.contact_number) updates.contact_number = req.body.contact_number;
    
    // Handle file upload - works with both single file and multiple files
    let uploadedFile = null;
    
    if (req.file) {
      // If using upload.single()
      uploadedFile = req.file;
    } else if (req.files && req.files.length > 0) {
      // If using upload.any() - get the first file that looks like a photo
      uploadedFile = req.files.find(file => 
        file.fieldname.includes('photo') || 
        file.mimetype.startsWith('image/')
      ) || req.files[0];
    }
    
    if (uploadedFile) {
      console.log('Processing uploaded file:', uploadedFile);
      
      // Delete old profile photo if it exists
      try {
        const [currentUser] = await db.query(
          'SELECT profile_photo_url FROM users WHERE id = ?',
          [id]
        );
        
        if (currentUser[0] && currentUser[0].profile_photo_url && 
            !currentUser[0].profile_photo_url.includes('default-avatar') &&
            !currentUser[0].profile_photo_url.includes('default-picz')) {
          const oldPhotoPath = path.join(__dirname, '..', currentUser[0].profile_photo_url);
          if (fs.existsSync(oldPhotoPath)) {
            fs.unlinkSync(oldPhotoPath);
            console.log('✅ Deleted old profile photo:', oldPhotoPath);
          }
        }
      } catch (deleteError) {
        console.warn('⚠️ Could not delete old photo:', deleteError.message);
      }
      
      updates.profile_photo_url = `/uploads/profile_photos/${uploadedFile.filename}`;
      console.log('✅ New profile photo URL:', updates.profile_photo_url);
    }

    // Handle password
    let passwordUpdated = false;
    if (req.body.newPassword && req.body.newPassword.trim()) {
      const hashed = await bcrypt.hash(req.body.newPassword, 10);
      updates.password = hashed;
      passwordUpdated = true;
      console.log('✅ Password will be updated');
    }

    // Perform update if there are changes
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const query = `UPDATE users SET ${setClause} WHERE id = ?`;
      const values = [...Object.values(updates), id];
      
      console.log('📝 Executing query:', query);
      console.log('📝 With values:', values.map((v, i) => 
        Object.keys(updates)[i] === 'password' ? '[HIDDEN]' : v
      ));
      
      await db.query(query, values);
      console.log('✅ Database updated successfully');
    } else {
      console.log('ℹ️ No changes to update');
    }

    // Return updated user data
    const [user] = await db.query(
      'SELECT id, name, email, contact_number, profile_photo_url, role, created_at FROM users WHERE id = ?',
      [id]
    );

    console.log('✅ Returning updated user:', user[0]);

    res.json({ 
      success: true,
      user: user[0],
      message: passwordUpdated ? 'Profile and password updated successfully' : 'Profile updated successfully'
    });

  } catch (err) {
    console.error('❌ Update error:', err);
    res.status(500).json({ 
      success: false,
      message: err.code === 'ER_DUP_ENTRY' ? 'Email already exists' : `Update failed: ${err.message}`
    });
  }
};

// ✅ PUT /api/users/:id/password
exports.updatePassword = async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
  
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
  
    try {
      const hashed = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, id]);
      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Error updating password' });
    }
};

// For the separate photo upload endpoint
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/profile_photos');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });
  
// ✅ POST /api/users/:id/photo
exports.uploadPhoto = [
  upload.single('photo'),
  async (req, res) => {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const photoUrl = `/uploads/profile_photos/${req.file.filename}`;
    try {
      await db.query('UPDATE users SET profile_photo_url = ? WHERE id = ?', [photoUrl, id]);
      res.json({ message: 'Photo uploaded', profile_photo_url: photoUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Error uploading photo' });
    }
  }
];