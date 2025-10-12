// controllers/contactInfoController.js (for public access)
const ContactInfo = require('../models/ContactInfo');

// Get contact information (public endpoint)
exports.getContactInfo = async (req, res) => {
  try {
    console.log('Public: Fetching contact information...');
    const contactInfo = await ContactInfo.getContactInfo();
    
    if (!contactInfo) {
      return res.status(404).json({
        success: false,
        message: 'Contact information not found'
      });
    }
    
    console.log('Contact info retrieved successfully');
    res.json({
      success: true,
      data: contactInfo
    });
  } catch (error) {
    console.error('Error fetching contact info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact information',
      error: error.message
    });
  }
};