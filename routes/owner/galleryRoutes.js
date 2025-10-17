
  // routes/owner/galleryRoutes.js
  const express = require('express');
  const router = express.Router();
  const { verifyToken } = require('../../middleware/authMiddleware');
  const galleryController = require('../../controllers/owner/galleryController');
  const multer = require('multer');
  const path = require('path');

  // Configure multer to save to 'uploads/gallery'
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/gallery'); 
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, uniqueSuffix + ext);
    }
  });

  const fileFilter = (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  };

  const upload = multer({ 
    storage,
    fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  // Routes
  router.get('/', verifyToken, galleryController.getGallery);
  router.post('/upload', verifyToken, upload.single('image'), galleryController.uploadImage);
  router.delete('/:id', verifyToken, galleryController.deleteImage);

  module.exports = router;