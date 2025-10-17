// routes/staff/petRecordsRoutes.js
const express = require('express');
const router = express.Router();
const petRecordsController = require('../../controllers/staff/petRecordsController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = 'uploads/pets/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'staff-pet-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Apply authentication and staff authorization to all routes
router.use(verifyToken, authorize('staff'));

// Routes that need to be BEFORE the :id route
router.get('/search-pet-owners', petRecordsController.searchPetOwners);
router.get('/search', petRecordsController.searchPetRecords);
router.get('/stats', petRecordsController.getPetRecordsStats);

// POST route for creating pets
router.post('/pets', upload.single('photo'), petRecordsController.createPet);

// GET /api/staff/pet-records - Get all pet records (with pagination)
router.get('/', petRecordsController.getAllPetRecords);

// PUT /api/staff/pet-records/:id - Update specific pet record
router.put('/:id', upload.single('photo'), petRecordsController.updatePet);

// DELETE /api/staff/pet-records/:id - Delete specific pet record
router.delete('/:id', petRecordsController.deletePet);

// GET /api/staff/pet-records/:id - Get specific pet record by ID (MUST be last)
router.get('/:id', petRecordsController.getPetRecordById);

module.exports = router;