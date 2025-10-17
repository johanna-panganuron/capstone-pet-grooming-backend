// controllers/authController.js

const db = require('../models/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const { sendVerificationEmail, sendResetPasswordEmail } = require('../utils/email');
const axios = require('axios'); 
const path = require('path');
const fs = require('fs');

// LOGIN with JWT 
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  console.log('--- Backend Login Request ---');
  console.log('Received login attempt for email:', email);

  try {
      console.log(`Attempting to find user with email: ${email}`);
      const [rows] = await db.query(
          'SELECT id, email, password, role, name, contact_number, profile_photo_url, staff_type, created_at FROM users WHERE email = ?', 
          [email]
      );

      console.log('DB Query Result (rows.length):', rows.length);
      if (rows.length === 0) {
          console.log('Login Failed: User not found for email:', email);
          return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = rows[0];
      console.log('User found in DB:', { 
          id: user.id, 
          email: user.email, 
          role: user.role, 
          name: user.name,
          staff_type: user.staff_type 
      });

      // Compare passwords
      console.log('Comparing provided password with hashed password from DB...');
      const isPasswordMatch = await bcrypt.compare(password, user.password);
      console.log('Password comparison result (isPasswordMatch):', isPasswordMatch);

      if (!isPasswordMatch) {
          console.log('Login Failed: Incorrect password for user:', email);
          return res.status(401).json({ message: 'Incorrect password' });
      }

      // Generate JWT token
      const token = jwt.sign(
          { 
              id: user.id, 
              name: user.name, 
              email: user.email,
              role: user.role,
              staff_type: user.staff_type
          },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      console.log('JWT Token generated successfully with payload:', {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          staff_type: user.staff_type
      });

      // Send success response - INCLUDE ALL FIELDS
      console.log('Login Successful! Sending response to frontend.');
      res.status(200).json({
          message: 'Login successful',
          token,
          user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              staff_type: user.staff_type, 
              contact_number: user.contact_number,
              profile_photo_url: user.profile_photo_url ?? null,
              created_at: user.created_at
          }
      });

  } catch (err) {
      console.error('Login error (Caught in try-catch block):', err);
      res.status(500).json({ message: 'Error during login', error: err.message });
  }
  console.log('--- Backend Login Request End ---');
};

// REGISTER with validation
exports.verifyAndRegister = [
  body('name').notEmpty(),
  body('phone').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('code').notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, phone: contact_number, email, password, code } = req.body;
    const role = 'pet_owner';

    try {
      const [rows] = await db.query(
        'SELECT * FROM email_verification_codes WHERE email = ? AND code = ?',
        [email, code]
      );

      if (rows.length === 0) {
        return res.status(400).json({ message: 'Invalid verification code' });
      }

      const record = rows[0];
      if (new Date(record.expires_at) < new Date()) {
        return res.status(400).json({ message: 'Verification code expired' });
      }

      const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
      if (users.length > 0) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await db.query(
        'INSERT INTO users (name, contact_number, email, password, role) VALUES (?, ?, ?, ?, ?)',
        [name, contact_number, email, hashedPassword, role]
      );

      await db.query('DELETE FROM email_verification_codes WHERE email = ?', [email]);

      res.status(201).json({ message: 'Registration successful' });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ message: 'Error during registration' });
    }
  }
];

// SEND VERIFICATION CODE (5 mins expiry)
exports.sendVerificationCode = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (users.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    await db.query('DELETE FROM email_verification_codes WHERE email = ?', [email]);

    await db.query(
      'INSERT INTO email_verification_codes (email, code, expires_at) VALUES (?, ?, ?)',
      [email, code, expiresAt]
    );

    await sendVerificationEmail(email, code);

    res.json({ message: 'Verification code sent to email' });
  } catch (err) {
    console.error('Error sending verification code:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};


// SEND RESET PASSWORD LINK
exports.sendResetPasswordLink = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const [users] = await db.query('SELECT id, name FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'No user found with that email' });
    }

    const user = users[0];

    const resetToken = jwt.sign(
      { id: user.id, email: email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;

    await sendResetPasswordEmail(email, user.name, resetLink);

    res.json({ message: 'Reset link sent to email' });
  } catch (err) {
    console.error('Error sending reset link:', err);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  try {
    // Verify token
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = payload.id;

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update DB
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(400).json({ message: 'Invalid or expired token' });
  }
};

// refreshToken method
exports.refreshToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    
    // Verify user still exists
    const [userRows] = await db.query(
      'SELECT id, name, email, role, staff_type, contact_number, profile_photo_url, created_at FROM users WHERE id = ?', 
      [decoded.id]
    );
    
    if (userRows.length === 0) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    const user = userRows[0];
    
    // Issue new token 
    const newToken = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({ 
      token: newToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type, 
        contact_number: user.contact_number,
        profile_photo_url: user.profile_photo_url,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Helper function to download and save Gmail photo locally
async function saveGmailPhoto(userId, photoUrl) {
  try {
    if (!photoUrl) {
      console.log('No photoUrl provided');
      return null;
    }

    console.log('Downloading photo from:', photoUrl);
    const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    console.log('Photo downloaded, size:', buffer.length, 'bytes');

    const uploadDir = path.join(__dirname, '../uploads/profile_photos');
    console.log('Upload directory path:', uploadDir);
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created upload directory');
    }

    const filename = `user_${userId}_${Date.now()}.jpg`;
    const filepath = path.join(uploadDir, filename);
    console.log('Saving to:', filepath);
    
    fs.writeFileSync(filepath, buffer);
    console.log('File saved successfully');

    const localUrl = `/uploads/profile_photos/${filename}`;
    console.log('Local photo URL:', localUrl);
    
    return localUrl;
  } catch (error) {
    console.error('Error saving Gmail photo:', error.message);
    console.error('Error details:', error);
    return '/default-profile.png';
  }
}
// Replace the googleAuth function - this version ALWAYS saves the photo locally

exports.googleAuth = async (req, res) => {
  try {
    const { access_token, is_signup } = req.body;
    
    console.log('Google auth request:', { is_signup, has_token: !!access_token });
    
    const googleResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const googleUser = googleResponse.data;
    console.log('Google user data:', { 
      id: googleUser.id, 
      email: googleUser.email, 
      name: googleUser.name 
    });

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [googleUser.email]);
    let user = users[0];
    let isNewUser = false;

    if (!user) {
      if (is_signup) {
        console.log('Creating new Google user...');
        
        const savedPhotoPath = await saveGmailPhoto(null, googleUser.picture);
        console.log('Photo saved:', savedPhotoPath);
        
        const [result] = await db.query(
          `INSERT INTO users (name, email, profile_photo_url, role, contact_number, oauth_provider, oauth_id, staff_type) 
           VALUES (?, ?, ?, 'pet_owner', NULL, 'google', ?, NULL)`,
          [googleUser.name, googleUser.email, savedPhotoPath, googleUser.id]
        );
        
        const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
        user = newUser[0];
        isNewUser = true;
        
        console.log('New Google user created:', { id: user.id, email: user.email });
      } else {
        return res.status(404).json({ 
          success: false,
          message: 'No account found with this Google email. Please sign up first.' 
        });
      }
    } else {
      // ALWAYS save the photo on login (don't check oauth_provider)
      const savedPhotoPath = await saveGmailPhoto(user.id, googleUser.picture);
      console.log('Photo saved for existing user:', savedPhotoPath);
      
      await db.query(
        'UPDATE users SET oauth_provider = ?, oauth_id = ?, profile_photo_url = ? WHERE id = ?',
        ['google', googleUser.id, savedPhotoPath, user.id]
      );
      
      user.oauth_provider = 'google';
      user.oauth_id = googleUser.id;
      user.profile_photo_url = savedPhotoPath;
      
      if (is_signup) {
        return res.status(400).json({ 
          success: false,
          message: 'An account with this email already exists. Please login instead.' 
        });
      }
      console.log('Existing Google user logged in:', { id: user.id, email: user.email });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const needsProfileCompletion = !user.contact_number || user.contact_number.trim() === '';

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_type: user.staff_type, 
        contact_number: user.contact_number,
        profile_photo_url: user.profile_photo_url,
        requires_profile_completion: isNewUser || needsProfileCompletion
      }
    });

  } catch (err) {
    console.error('Google auth error:', err);
    
    if (err.response && err.response.status === 401) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid Google access token' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Google authentication failed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};