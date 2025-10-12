const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads/profile_photos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `user_${req.params.id}_${Date.now()}${ext}`;
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('File filter - field name:', file.fieldname);
    console.log('File filter - original name:', file.originalname);
    console.log('File filter - mimetype:', file.mimetype);
    
    // Accept any field name that contains 'photo' to be more flexible
    if (file.fieldname.includes('photo') && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.mimetype.startsWith('image/')) {
      // If it's an image, accept it regardless of field name
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Debug middleware
const debugMulter = (req, res, next) => {
  console.log('=== MULTER DEBUG START ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Request method:', req.method);
  console.log('Route params:', req.params);
  console.log('Body keys:', Object.keys(req.body || {}));
  console.log('=== MULTER DEBUG END ===');
  next();
};

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer Error:', err);
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: `Unexpected file field. Expected field name containing 'photo', got: ${err.field}`
      });
    }
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  if (err) {
    console.error('Other Error:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  next();
};

// Routes
router.get('/:id', verifyToken, userController.getUserById);

// Use any() instead of single() to be more flexible with field names
router.put('/:id', 
  verifyToken, 
  debugMulter, 
  upload.any(), // This accepts any field names
  handleMulterError,
  userController.updateUserById
);

router.put('/:id/password', verifyToken, userController.updatePassword);
router.post('/:id/photo', verifyToken, userController.uploadPhoto);

module.exports = router;