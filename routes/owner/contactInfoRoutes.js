// routes/owner/contactInfoRoutes.js
const express = require('express');
const router = express.Router();
const contactInfoController = require('../../controllers/owner/contactInfoController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');

// Apply middleware - owner only
router.use(verifyToken);
router.use(authorize('owner'));

// Contact Info Routes
router.get('/contact-info', contactInfoController.getContactInfo);          // GET /api/owner/contact-info
router.post('/contact-info', contactInfoController.saveContactInfo);        // POST /api/owner/contact-info
router.put('/contact-info', contactInfoController.updateContactInfo);       // PUT /api/owner/contact-info
router.delete('/contact-info', contactInfoController.deleteContactInfo);    // DELETE /api/owner/contact-info

module.exports = router;