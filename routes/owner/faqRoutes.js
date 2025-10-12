// routes/owner/faqRoutes.js
const express = require('express');
const router = express.Router();
const faqController = require('../../controllers/owner/faqController');
const { verifyToken, authorize } = require('../../middleware/authMiddleware');

// Apply middleware
router.use(verifyToken);
router.use(authorize('owner'));

// FAQ Routes
router.get('/faqs', faqController.getAllFaqs);       // GET /api/owner/faqs
router.post('/faqs', faqController.createFaq);       // POST /api/owner/faqs
router.put('/faqs/:id', faqController.updateFaq);    // PUT /api/owner/faqs/:id
router.delete('/faqs/:id', faqController.deleteFaq); // DELETE /api/owner/faqs/:id

module.exports = router;