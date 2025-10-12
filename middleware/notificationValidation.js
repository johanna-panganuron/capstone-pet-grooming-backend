// middleware/notificationValidation.js

const validateCreateNotification = (req, res, next) => {
    const { user_id, title, message, type } = req.body;
    
    const errors = [];
    
    if (!user_id || !Number.isInteger(user_id) || user_id <= 0) {
      errors.push('Valid user_id is required');
    }
    
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      errors.push('Title is required');
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      errors.push('Message is required');
    }
    
    if (type && !['appointment', 'payment', 'system', 'general'].includes(type)) {
      errors.push('Invalid notification type');
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    next();
  };
  
  module.exports = {
    validateCreateNotification
  };