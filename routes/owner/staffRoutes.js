// routes/owner/staffRoutes.js
const express = require('express');
const router = express.Router();
const staffController = require('../../controllers/owner/staffController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads with proper naming
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Protect all routes — owner only
router.use(verifyToken, authorize('owner'));

// Staff CRUD routes
router.post('/add-staff', upload.single('profile_photo'), staffController.addStaff);
router.get('/staff', staffController.getAllStaff);
router.get('/staff/:id', staffController.getStaffById);
router.patch('/staff/:id', upload.single('profile_photo'), staffController.updateStaff);
router.patch('/staff/:id/status', staffController.updateStaffStatus);
router.delete('/staff/:id', staffController.deleteStaffPermanently);
router.get('/groomers', staffController.getGroomers);

module.exports = router;