// routes/petRoutes.js

const { verifyToken } = require('../middleware/authMiddleware');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const petController = require('../controllers/petController');
const groomingHistoryController = require('../controllers/groomingHistoryController');

// Setup multer for photo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// Protect ALL routes with verifyToken
router.use(verifyToken);

// Pet CRUD Routes
router.post('/', upload.single('photo'), petController.addPet);
router.get('/', petController.getAllPets);
router.get('/:id', petController.getPetById);
router.put('/:id', upload.single('photo'), petController.updatePet);
router.delete('/:id', petController.deletePet);

// Grooming History Routes
router.get('/:petId/grooming-history', groomingHistoryController.getPetGroomingHistory);
router.get('/:petId/grooming-history/stats', groomingHistoryController.getGroomingHistoryStats);

module.exports = router;