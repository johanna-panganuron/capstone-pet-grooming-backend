// controllers/owner/faqController.js - Updated with Activity Logging
const Faq = require('../../models/faqModel');
const { ActivityLogger } = require('../../utils/activityLogger'); 

exports.getAllFaqs = async (req, res) => {
  try {
    const faqs = await Faq.findAll();
    res.json({ success: true, data: faqs });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch FAQs',
      error: error.message 
    });
  }
};

exports.createFaq = async (req, res) => {
  try {
    const { question, answer } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Question and answer are required' 
      });
    }

    const id = await Faq.create(question, answer);
    
    // ✅ Log owner activity with actual owner name
    await ActivityLogger.log(
      req.user, // Contains actual owner info: "John Smith" not "Owner"
      'faq_create',
      'faq',
      `FAQ #${id}`,
      `Created new FAQ: ${question.substring(0, 50)}...`,
      req
    );
    
    res.status(201).json({ 
      success: true, 
      data: { id, question, answer } 
    });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create FAQ',
      error: error.message 
    });
  }
};

exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ 
        success: false, 
        message: 'Question and answer are required' 
      });
    }

    const updated = await Faq.update(id, question, answer);
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'FAQ not found' 
      });
    }

    // ✅ Log owner update activity
    await ActivityLogger.log(
      req.user,
      'faq_update',
      'faq',
      `FAQ #${id}`,
      `Updated FAQ: ${question.substring(0, 50)}...`,
      req
    );

    res.json({ success: true, message: 'FAQ updated successfully' });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update FAQ',
      error: error.message 
    });
  }
};
exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get FAQ details before deletion for logging
    const faq = await Faq.findById(id);
    
    if (!faq) {
      return res.status(404).json({ 
        success: false, 
        message: 'FAQ not found' 
      });
    }

    const deleted = await Faq.delete(id);
    
    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'FAQ not found' 
      });
    }

    // ✅ Log owner delete activity
    await ActivityLogger.log(
      req.user,
      'faq_delete',
      'faq',
      `FAQ #${id}`,
      `Deleted FAQ: ${faq.question.substring(0, 50)}${faq.question.length > 50 ? '...' : ''}`,
      req
    );

    res.json({ success: true, message: 'FAQ deleted successfully' });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete FAQ',
      error: error.message 
    });
  }
};