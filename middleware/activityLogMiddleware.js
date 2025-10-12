// middleware/activityLogMiddleware.js
const { logActivity } = require('../controllers/owner/activityLogController');

// Middleware to automatically log certain activities
const activityLogger = (action, target_type = null) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override res.json to capture response
    res.json = function(data) {
      // Only log if the operation was successful
      if (data && data.success !== false && req.user) {
        // Extract target information from response or request
        const target_name = extractTargetName(data, req, target_type);
        const target_id = extractTargetId(data, req, target_type);
        
        // Log the activity asynchronously
        setImmediate(async () => {
          try {
            await logActivity({
              user_id: req.user.id,
              user_name: req.user.name,
              user_role: req.user.role,
              action: action,
              target_type: target_type,
              target_id: target_id,
              target_name: target_name,
              details: generateActivityDetails(action, data, req),
              ip_address: req.ip || req.connection.remoteAddress,
              user_agent: req.get('User-Agent')
            });
          } catch (error) {
            console.error('Failed to log activity:', error);
          }
        });
      }
      
      // Call original json method
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Helper function to extract target name from response/request
const extractTargetName = (data, req, target_type) => {
  if (target_type === 'appointment' && data.data) {
    return `Appointment #${data.data.id || req.params.id}`;
  }
  if (target_type === 'walk_in' && data.data) {
    return `Walk-in #${data.data.queue_number || req.params.id}`;
  }
  if (target_type === 'user' && data.data) {
    return data.data.name || `User #${data.data.id || req.params.id}`;
  }
  if (target_type === 'pet' && data.data) {
    return data.data.name || `Pet #${data.data.id || req.params.id}`;
  }
  if (target_type === 'service' && data.data) {
    return data.data.name || `Service #${data.data.id || req.params.id}`;
  }
  if (target_type === 'payment' && data.data) {
    return `Payment #${data.data.id || req.params.id}`;
  }
  
  return null;
};

// Helper function to extract target ID
const extractTargetId = (data, req, target_type) => {
  if (data.data && data.data.id) {
    return data.data.id;
  }
  if (req.params && req.params.id) {
    return parseInt(req.params.id);
  }
  return null;
};

// Helper function to generate activity details
const generateActivityDetails = (action, data, req) => {
  const details = [];
  
  switch (action) {
    case 'appointment_book':
      if (req.body.preferred_date) {
        details.push(`Scheduled for ${req.body.preferred_date}`);
      }
      if (req.body.pet_name) {
        details.push(`Pet: ${req.body.pet_name}`);
      }
      break;
      
    case 'appointment_cancel':
      if (req.body.reason) {
        details.push(`Reason: ${req.body.reason}`);
      }
      break;
      
    case 'walk_in_create':
      if (req.body.queue_number) {
        details.push(`Queue #${req.body.queue_number}`);
      }
      if (req.body.service_name) {
        details.push(`Service: ${req.body.service_name}`);
      }
      break;
      
    case 'payment_complete':
      if (req.body.amount) {
        details.push(`Amount: ₱${req.body.amount}`);
      }
      if (req.body.payment_method) {
        details.push(`Method: ${req.body.payment_method}`);
      }
      break;
      
    case 'service_create':
    case 'service_update':
      if (req.body.name) {
        details.push(`Service: ${req.body.name}`);
      }
      if (req.body.price_small) {
        details.push(`Price: ₱${req.body.price_small}`);
      }
      break;
      
    case 'user_create':
    case 'user_update':
      if (req.body.email) {
        details.push(`Email: ${req.body.email}`);
      }
      if (req.body.role) {
        details.push(`Role: ${req.body.role}`);
      }
      break;
      
    case 'pet_create':
    case 'pet_update':
      if (req.body.name && req.body.type) {
        details.push(`${req.body.type}: ${req.body.name}`);
      }
      if (req.body.breed) {
        details.push(`Breed: ${req.body.breed}`);
      }
      break;
  }
  
  return details.length > 0 ? details.join(', ') : null;
};

// Manual logging function for custom activities
const manualLog = async (user, action, target_type, target_name, details, req) => {
  try {
    await logActivity({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role,
      action: action,
      target_type: target_type,
      target_id: null,
      target_name: target_name,
      details: details,
      ip_address: req ? (req.ip || req.connection.remoteAddress) : null,
      user_agent: req ? req.get('User-Agent') : null
    });
  } catch (error) {
    console.error('Failed to manually log activity:', error);
  }
};

// Activity constants for consistency
const ACTIONS = {
  // Authentication
  LOGIN: 'login',
  LOGOUT: 'logout',
  REGISTER: 'register',
  
  // CRUD Operations
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  
  // Appointments
  APPOINTMENT_BOOK: 'appointment_book',
  APPOINTMENT_CONFIRM: 'appointment_confirm',
  APPOINTMENT_CANCEL: 'appointment_cancel',
  APPOINTMENT_RESCHEDULE: 'appointment_reschedule',
  APPOINTMENT_COMPLETE: 'appointment_complete',
  APPOINTMENT_NO_SHOW: 'appointment_no_show',
  
  // Walk-ins
  WALK_IN_CREATE: 'walk_in_create',
  WALK_IN_START: 'walk_in_start',
  WALK_IN_COMPLETE: 'walk_in_complete',
  WALK_IN_CANCEL: 'walk_in_cancel',
  
  // Payments
  PAYMENT_CREATE: 'payment_create',
  PAYMENT_COMPLETE: 'payment_complete',
  PAYMENT_REFUND: 'payment_refund',
  PAYMENT_FAIL: 'payment_fail',
  
  // Services
  SERVICE_CREATE: 'service_create',
  SERVICE_UPDATE: 'service_update',
  SERVICE_DELETE: 'service_delete',
  SERVICE_TOGGLE: 'service_toggle',
  
  // Users
  USER_CREATE: 'user_create',
  USER_UPDATE: 'user_update',
  USER_DELETE: 'user_delete',
  USER_STATUS_CHANGE: 'user_status_change',
  
  // Pets
  PET_CREATE: 'pet_create',
  PET_UPDATE: 'pet_update',
  PET_DELETE: 'pet_delete',
  
  // System
  SYSTEM_BACKUP: 'system_backup',
  SYSTEM_RESTORE: 'system_restore',
  CLEAN_OLD_LOGS: 'clean_old_logs',
  
  // Gallery
  GALLERY_UPLOAD: 'gallery_upload',
  GALLERY_DELETE: 'gallery_delete',
  
  // Reports
  REPORT_GENERATE: 'report_generate',
  REPORT_EXPORT: 'report_export'
};

const TARGET_TYPES = {
  APPOINTMENT: 'appointment',
  WALK_IN: 'walk_in',
  USER: 'user',
  PET: 'pet',
  SERVICE: 'service',
  PAYMENT: 'payment',
  GALLERY: 'gallery',
  SYSTEM: 'system',
  REPORT: 'report'
};

module.exports = {
  activityLogger,
  manualLog,
  ACTIONS,
  TARGET_TYPES
};