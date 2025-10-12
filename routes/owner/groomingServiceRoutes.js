// routes/owner/groomingServiceRoutes.js
const express = require('express');
const router = express.Router();
const groomingServiceController = require('../../controllers/owner/groomingServiceController');
const authMiddleware = require('../../middleware/authMiddleware');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// READ (Get Service Statistics) - MOVE THIS BEFORE THE /:id ROUTE
router.get('/stats',
  authMiddleware.verifyToken,
  authMiddleware.verifyOwner,
  groomingServiceController.getServiceStats
);

// CREATE
router.post('/',
  authMiddleware.verifyToken,
  authMiddleware.verifyOwner,
  upload.single('image'),
  groomingServiceController.createService
);

// READ (All)
router.get('/',
  authMiddleware.verifyToken,
  authMiddleware.verifyOwner,
  groomingServiceController.getAllServices
);

// READ (Single) - MOVE THIS AFTER STATS ROUTE
router.get('/:id',
  authMiddleware.verifyToken,
  authMiddleware.verifyOwner,
  groomingServiceController.getServiceById
);

// UPDATE
router.put('/:id',
  authMiddleware.verifyToken,
  authMiddleware.verifyOwner,
  upload.single('image'),
  groomingServiceController.updateService
);

// DELETE
router.delete('/:id',
  authMiddleware.verifyToken,
  authMiddleware.verifyOwner,
  groomingServiceController.deleteService
);

module.exports = router;