// routes/gallery.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/public', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, image_url, created_at FROM gallery ORDER BY id DESC');    
    res.json({ 
      success: true,
      data: rows,
      count: rows.length
    });
  } catch (err) {
    console.error('Error fetching public gallery:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      data: []
    });
  }
});

module.exports = router;