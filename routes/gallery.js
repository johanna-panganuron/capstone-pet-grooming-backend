// routes/gallery.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

// PUBLIC GALLERY ROUTE - Updated with better error handling
router.get('/public', async (req, res) => {
  try {
    // console.log('🖼️  Fetching public gallery...');
    const [rows] = await db.execute('SELECT id, image_url, created_at FROM gallery ORDER BY id DESC');
    
    // console.log(`📊 Found ${rows.length} gallery images`);
    // console.log('🔍 Sample image URLs:', rows.slice(0, 2).map(r => r.image_url));
    
    res.json({ 
      success: true,
      data: rows,
      count: rows.length
    });
  } catch (err) {
    console.error('❌ Error fetching public gallery:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      data: []
    });
  }
});

module.exports = router;
