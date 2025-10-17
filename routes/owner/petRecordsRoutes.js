// routes/owner/petRecordsRoutes.js
const express = require('express');
const router = express.Router();
const petRecordsController = require('../../controllers/owner/petRecordsController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
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
    cb(null, 'pet-' + uniqueSuffix + path.extname(file.originalname));
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

// Apply authentication to all routes
router.use(verifyToken);

// Pet CRUD operations - Allow both owners and pet_owners
router.post('/pets', 
  authorize(['owner', 'pet_owner', 'staff']), 
  upload.single('photo'), 
  petRecordsController.createPet
);

router.put('/pets/:id', 
  authorize(['owner', 'pet_owner', 'staff']), 
  upload.single('photo'), 
  petRecordsController.updatePet
);

// DELETE route - This is the important one for your issue
router.delete('/pets/:id', 
  authorize(['owner', 'pet_owner', 'staff']), 
  petRecordsController.deletePet
);

// Search and administrative functions - Owner only
router.get('/search-pet-owners', 
  authorize('owner'), 
  petRecordsController.searchPetOwners
);

router.get('/search', 
  authorize(['owner', 'pet_owner']), 
  petRecordsController.searchPetRecords
);

router.get('/stats', 
  authorize('owner'), 
  petRecordsController.getPetRecordsStats
);

// Grooming history route
router.get('/:id/history', 
  authorize(['owner', 'pet_owner', 'staff']), 
  petRecordsController.getPetGroomingHistory
);

// GENERIC ROUTES LAST
router.get('/', 
  authorize(['owner', 'pet_owner', 'staff']), 
  petRecordsController.getAllPetRecords
);

router.get('/:id', 
  authorize(['owner', 'pet_owner', 'staff']), 
  petRecordsController.getPetRecordById
);

module.exports = router;