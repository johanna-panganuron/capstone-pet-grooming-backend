// controllers/owner/galleryController.js - Updated with PROPER Activity Logging
const db = require('../../models/db');
const fs = require('fs');
const path = require('path');
const { ActivityLogger } = require('../../utils/activityLogger'); 

exports.getGallery = async (req, res) => {
  try {
    console.log('🖼️  Owner fetching gallery...');
    const [rows] = await db.execute('SELECT * FROM gallery ORDER BY created_at DESC');
    
    console.log(`📊 Found ${rows.length} gallery images for owner`);
    
    res.json({ 
      success: true,
      data: rows 
    });
  } catch (error) {
    console.error('❌ Gallery fetch error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch gallery images',
      data: []
    });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'No image uploaded' 
      });
    }

    // Store path WITH leading slash (to match your existing data)
    const imagePath = `/uploads/gallery/${req.file.filename}`;
    
    console.log('📷 Uploading image with path:', imagePath);
    console.log('📁 File saved to:', req.file.path);
    
    const [result] = await db.execute('INSERT INTO gallery (image_url) VALUES (?)', [imagePath]);
    
    // ✅ Log owner gallery upload activity with actual owner name
    try {
      await ActivityLogger.log(
        req.user, // Contains actual owner info: "John Smith" not "Owner"
        'gallery_upload',
        'gallery',
        `Image #${result.insertId}`,
        `Uploaded new gallery image: ${req.file.originalname}`,
        req
      );
      console.log('📝 Activity logged: Gallery image uploaded');
    } catch (logError) {
      console.error('❌ Activity logging failed:', logError);
      // Don't break the main functionality
    }
    
    res.json({ 
      success: true,
      message: 'Image uploaded successfully',
      image_url: imagePath 
    });
  } catch (error) {
    console.error('❌ Gallery upload error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to upload image' 
    });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM gallery WHERE id = ?', [req.params.id]);
    
    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Image not found' 
      });
    }

    const imageUrl = rows[0].image_url;
    const filePath = path.join(__dirname, '../..', imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl);
    
    console.log('🗑️  Deleting image:', imageUrl);
    console.log('📁 File path:', filePath);
    
    // Delete file from filesystem
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('❌ Failed to delete file:', err);
      } else {
        console.log('✅ File deleted successfully');
      }
    });

    // Delete from database
    await db.execute('DELETE FROM gallery WHERE id = ?', [req.params.id]);
    
    // ✅ Log owner gallery delete activity
    try {
      await ActivityLogger.log(
        req.user,
        'gallery_delete',
        'gallery',
        `Image #${req.params.id}`,
        `Deleted gallery image: ${path.basename(imageUrl)}`,
        req
      );
      console.log('📝 Activity logged: Gallery image deleted');
    } catch (logError) {
      console.error('❌ Activity logging failed:', logError);
      // Don't break the main functionality
    }
    
    res.json({ 
      success: true,
      message: 'Image deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Gallery delete error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete image' 
    });
  }
};