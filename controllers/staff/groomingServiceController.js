// controllers/staff/groomingServiceController.js
const GroomingService = require('../../models/GroomingService');
const { ActivityLogger } = require('../../utils/activityLogger');


// READ (Get All Services) - Staff can view all services
exports.getAllServices = async (req, res) => {
  try {
    const services = await GroomingService.findAll();
    
    // Log the view activity
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'GROOMING_SERVICES',
      'All Grooming Services',
      `Viewed all grooming services | Total services: ${services.length} | Available: ${services.filter(s => s.status === 'available').length} | Unavailable: ${services.filter(s => s.status === 'unavailable').length}`,
      req
    );

    res.status(200).json({
      success: true,
      data: services,
      message: 'Services retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching services for staff:', error);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'GROOMING_SERVICES',
      'All Grooming Services',
      `Error retrieving grooming services: ${error.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Error fetching services',
      error: error.message
    });
  }
};

// READ (Get Single Service) - Staff can view individual service details
exports.getServiceById = async (req, res) => {
  try {
    const service = await GroomingService.findById(req.params.id);
    
    if (!service) {
      // Log failed attempt
      await ActivityLogger.log(
        req.user,
        'VIEW_FAILED',
        'GROOMING_SERVICE',
        `Service ID: ${req.params.id}`,
        'Failed to view grooming service - Service not found',
        req
      );

      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    
    // Log successful view
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'GROOMING_SERVICE',
      service.name,
      `Viewed grooming service details | Category: ${service.category} | Status: ${service.status} | Price range: $${service.price_xs}-$${service.price_xxl}`,
      req
    );

    res.status(200).json({
      success: true,
      data: service,
      message: 'Service retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching service for staff:', error);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'GROOMING_SERVICE',
      `Service ID: ${req.params.id}`,
      `Error retrieving grooming service: ${error.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Error fetching service',
      error: error.message
    });
  }
};

// READ (Get Available Services Only) - Useful for staff operations
exports.getAvailableServices = async (req, res) => {
  try {
    const services = await GroomingService.findAvailable();
    
    // Log the view activity
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'GROOMING_SERVICES',
      'Available Grooming Services',
      `Viewed available grooming services | Total available: ${services.length}`,
      req
    );

    res.status(200).json({
      success: true,
      data: services,
      message: 'Available services retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching available services for staff:', error);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'GROOMING_SERVICES',
      'Available Grooming Services',
      `Error retrieving available grooming services: ${error.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Error fetching available services',
      error: error.message
    });
  }
};

// UPDATE STATUS ONLY - Staff can only update the status field
exports.updateServiceStatus = async (req, res) => {
  try {
    const serviceId = req.params.id;
    const { status } = req.body;

    // Validate status input
    if (!status) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'GROOMING_SERVICE',
        `Service ID: ${serviceId}`,
        'Failed to update service status - Status field is required',
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    // Validate status value
    const validStatuses = ['available', 'unavailable'];
    if (!validStatuses.includes(status)) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'GROOMING_SERVICE',
        `Service ID: ${serviceId}`,
        `Failed to update service status - Invalid status: "${status}". Valid statuses: ${validStatuses.join(', ')}`,
        req
      );

      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Check if service exists
    const existingService = await GroomingService.findById(serviceId);
    if (!existingService) {
      // Log failed attempt
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'GROOMING_SERVICE',
        `Service ID: ${serviceId}`,
        'Failed to update service status - Service not found',
        req
      );

      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if status is actually changing
    if (existingService.status === status) {
      // Log no-change attempt
      await ActivityLogger.log(
        req.user,
        'UPDATE_ATTEMPTED',
        'GROOMING_SERVICE',
        existingService.name,
        `Attempted to update service status to same value: "${status}"`,
        req
      );

      return res.status(200).json({
        success: true,
        message: `Service status is already "${status}"`,
        data: {
          id: serviceId,
          currentStatus: status,
          message: 'No change made'
        }
      });
    }

    // Create service data object with only status change
    // Keep all existing data and only update status
    const serviceData = {
      name: existingService.name,
      description: existingService.description,
      image_url: existingService.image_url,
      price_xs: existingService.price_xs,
      price_small: existingService.price_small,
      price_medium: existingService.price_medium,
      price_large: existingService.price_large,
      price_xl: existingService.price_xl,
      price_xxl: existingService.price_xxl,
      time_description: existingService.time_description,
      status: status, // Only this field is updated
      category: existingService.category
    };

    await GroomingService.update(serviceId, serviceData);

    // Log successful status update
    await ActivityLogger.log(
      req.user,
      'UPDATED',
      'GROOMING_SERVICE',
      existingService.name,
      `Updated service status | Previous: "${existingService.status}" → New: "${status}" | Category: ${existingService.category}`,
      req
    );

    // Log the status change for audit purposes (existing console log)
    console.log(`Staff ${req.user.id} changed service ${serviceId} status from "${existingService.status}" to "${status}"`);

    res.status(200).json({
      success: true,
      message: `Service status updated to "${status}" successfully`,
      data: {
        id: serviceId,
        previousStatus: existingService.status,
        newStatus: status,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error updating service status by staff:', error);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'UPDATE_FAILED',
      'GROOMING_SERVICE',
      `Service ID: ${req.params.id}`,
      `Error updating service status: ${error.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Error updating service status',
      error: error.message
    });
  }
};

// GET services by category - Useful for staff to organize services
exports.getServicesByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    if (!category) {
      // Log validation failure
      await ActivityLogger.log(
        req.user,
        'VIEW_FAILED',
        'GROOMING_SERVICES',
        'Services by Category',
        'Failed to retrieve services by category - Category parameter is required',
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    const services = await GroomingService.findByCategory(category);
    
    // Log successful category view
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'GROOMING_SERVICES',
      `Services in Category: ${category}`,
      `Viewed grooming services by category | Category: "${category}" | Total services: ${services.length} | Available: ${services.filter(s => s.status === 'available').length}`,
      req
    );
    
    res.status(200).json({
      success: true,
      data: services,
      message: `Services in category "${category}" retrieved successfully`
    });
  } catch (error) {
    console.error('Error fetching services by category for staff:', error);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'GROOMING_SERVICES',
      `Services in Category: ${req.params.category || 'Unknown'}`,
      `Error retrieving services by category: ${error.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Error fetching services by category',
      error: error.message
    });
  }
};

// GET service statistics - Useful dashboard info for staff
exports.getServiceStats = async (req, res) => {
  try {
    const allServices = await GroomingService.findAll();
    
    const stats = {
      total: allServices.length,
      available: allServices.filter(service => service.status === 'available').length,
      unavailable: allServices.filter(service => service.status === 'unavailable').length,
      categories: [...new Set(allServices.map(service => service.category))],
      lastUpdated: new Date().toISOString()
    };

    // Calculate category breakdown
    const categoryBreakdown = {};
    allServices.forEach(service => {
      if (!categoryBreakdown[service.category]) {
        categoryBreakdown[service.category] = { total: 0, available: 0, unavailable: 0 };
      }
      categoryBreakdown[service.category].total++;
      categoryBreakdown[service.category][service.status]++;
    });

    // Log statistics view
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'GROOMING_STATISTICS',
      'Service Statistics Dashboard',
      `Viewed grooming service statistics | Total services: ${stats.total} | Available: ${stats.available} | Unavailable: ${stats.unavailable} | Categories: ${stats.categories.length}`,
      req
    );

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        categoryBreakdown
      },
      message: 'Service statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching service statistics for staff:', error);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'GROOMING_STATISTICS',
      'Service Statistics Dashboard',
      `Error retrieving service statistics: ${error.message}`,
      req
    );

    res.status(500).json({
      success: false,
      message: 'Error fetching service statistics',
      error: error.message
    });
  }
};