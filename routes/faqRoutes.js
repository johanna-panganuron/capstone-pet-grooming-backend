// routes/faqRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// PUBLIC FAQ ROUTE
router.get('/public', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT id, question, answer, created_at 
      FROM faqs 
      ORDER BY created_at DESC
    `);
    res.json({ 
      success: true,
      data: rows 
    });
  } catch (err) {
    console.error('Error fetching public FAQs:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load FAQs' 
    });
  }
});

module.exports = router;