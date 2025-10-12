// controllers/owner/contactInfoController.js
const ContactInfo = require('../../models/ContactInfo');
const { ActivityLogger } = require('../../utils/activityLogger');

// Get contact information for owner management
exports.getContactInfo = async (req, res) => {
  try {
    console.log('📞 Owner: Fetching contact information...');
    const contactInfo = await ContactInfo.getContactInfo();
    
    res.json({
      success: true,
      data: contactInfo || null
    });
  } catch (error) {
    console.error('❌ Owner: Error fetching contact info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact information',
      error: error.message
    });
  }
};

// Create or update contact information
exports.saveContactInfo = async (req, res) => {
  try {
    console.log('💾 Owner: Saving contact information...');
    
    const { shop_name, description, address, phone_number, email, business_hours } = req.body;
    
    // Validation
    if (!shop_name || !address || !phone_number || !email || !business_hours) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: shop_name, address, phone_number, email, business_hours'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if contact info already exists
    const existingInfo = await ContactInfo.getContactInfo();
    
    let result;
    if (existingInfo) {
      // Update existing
      result = await ContactInfo.updateContactInfo(existingInfo.id, {
        shop_name,
        description,
        address,
        phone_number,
        email,
        business_hours
      });
    } else {
      // Create new
      result = await ContactInfo.createContactInfo({
        shop_name,
        description,
        address,
        phone_number,
        email,
        business_hours
      });
    }
    
    if (result) {
      // ✅ Activity Log
      await ActivityLogger.log(
        req.user,
        existingInfo ? 'contact_info_update' : 'contact_info_create',
        'contact_info',
        shop_name,
        `${existingInfo ? 'Updated' : 'Created'} contact information for ${shop_name}`,
        req
      );

      res.json({
        success: true,
        message: existingInfo
          ? 'Contact information updated successfully'
          : 'Contact information created successfully'
      });
    } else {
      throw new Error('Failed to save contact information');
    }
    
  } catch (error) {
    console.error('❌ Owner: Error saving contact info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save contact information',
      error: error.message
    });
  }
};

// Update specific contact information
exports.updateContactInfo = async (req, res) => {
  try {
    console.log('📝 Owner: Updating contact information...');
    
    const { shop_name, description, address, phone_number, email, business_hours } = req.body;
    
    // Validation
    if (!shop_name || !address || !phone_number || !email || !business_hours) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: shop_name, address, phone_number, email, business_hours'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Get existing contact info
    const existingInfo = await ContactInfo.getContactInfo();
    
    if (!existingInfo) {
      return res.status(404).json({
        success: false,
        message: 'Contact information not found'
      });
    }
    
    const result = await ContactInfo.updateContactInfo(existingInfo.id, {
      shop_name,
      description,
      address,
      phone_number,
      email,
      business_hours
    });
    
    if (result) {
      // ✅ Activity Log
      await ActivityLogger.log(
        req.user,
        'contact_info_update',
        'contact_info',
        shop_name,
        `Updated contact information for ${shop_name}`,
        req
      );

      console.log('✅ Contact info updated successfully');
      res.json({
        success: true,
        message: 'Contact information updated successfully'
      });
    } else {
      throw new Error('Failed to update contact information');
    }
    
  } catch (error) {
    console.error('❌ Owner: Error updating contact info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact information',
      error: error.message
    });
  }
};

// Delete contact information
exports.deleteContactInfo = async (req, res) => {
  try {
    console.log('🗑️ Owner: Deleting contact information...');
    
    const existingInfo = await ContactInfo.getContactInfo();
    
    if (!existingInfo) {
      return res.status(404).json({
        success: false,
        message: 'Contact information not found'
      });
    }
    
    const result = await ContactInfo.deleteContactInfo(existingInfo.id);
    
    if (result) {
      // ✅ Activity Log
      await ActivityLogger.log(
        req.user,
        'contact_info_delete',
        'contact_info',
        'Contact Information',
        'Deleted contact information',
        req
      );

      console.log('✅ Contact info deleted successfully');
      res.json({
        success: true,
        message: 'Contact information deleted successfully'
      });
    } else {
      throw new Error('Failed to delete contact information');
    }
    
  } catch (error) {
    console.error('❌ Owner: Error deleting contact info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contact information',
      error: error.message
    });
  }
};
