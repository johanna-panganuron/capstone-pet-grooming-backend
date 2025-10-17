// routes/contactInfoRoutes.js (for public access)
const express = require('express');
const router = express.Router();
const contactInfoController = require('../controllers/contactInfoController');

// Public route - anyone can view contact info
router.get('/', contactInfoController.getContactInfo);

module.exports = router;