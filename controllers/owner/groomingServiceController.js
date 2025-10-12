// controllers/owner/groomingServiceController.js
const GroomingService = require('../../models/GroomingService');
const { ActivityLogger } = require('../../utils/activityLogger');
const fs = require('fs');
const path = require('path');

// CREATE
exports.createService = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Service image is required' 
      });
    }

    const requiredFields = [
      'name', 'description', 'price_xs', 'price_small',
      'price_medium', 'price_large', 'price_xl', 'price_xxl',
      'time_description', 'category'
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ 
          success: false, 
          message: `${field} is required` 
        });
      }
    }

    const serviceData = {
      ...req.body,
      image_url: `/uploads/${req.file.filename}`,
      status: req.body.status || 'available'
    };

    const serviceId = await GroomingService.create(serviceData);

    // ✅ Activity Log
    await ActivityLogger.log(
      req.user,
      'service_create',
      'grooming_service',
      serviceData.name,
      `Created new grooming service: ${serviceData.name} (${serviceData.category})`,
      req
    );

    res.status(201).json({ 
      success: true, 
      message: 'Service created successfully',
      serviceId 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating service',
      error: error.message 
    });
  }
};

// READ (Get All Services)
exports.getAllServices = async (req, res) => {
  try {
    const services = await GroomingService.findAll();
    res.status(200).json({
      success: true,
      data: services
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching services',
      error: error.message
    });
  }
};

// READ (Get Single Service)
exports.getServiceById = async (req, res) => {
  try {
    const service = await GroomingService.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }
    res.status(200).json({
      success: true,
      data: service
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service',
      error: error.message
    });
  }
};

// UPDATE
exports.updateService = async (req, res) => {
  try {
    const serviceId = req.params.id;
    const existingService = await GroomingService.findById(serviceId);
    
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    let imageUrl = existingService.image_url;
    if (req.file) {
      // Delete old image file
      if (existingService.image_url) {
        const oldImagePath = path.join(__dirname, '../../public', existingService.image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const serviceData = {
      ...req.body,
      image_url: imageUrl
    };

    await GroomingService.update(serviceId, serviceData);

    // ✅ Activity Log
    await ActivityLogger.log(
      req.user,
      'service_update',
      'grooming_service',
      serviceData.name || existingService.name,
      `Updated grooming service: ${serviceData.name || existingService.name}`,
      req
    );

    res.status(200).json({
      success: true,
      message: 'Service updated successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating service',
      error: error.message
    });
  }
};

// DELETE
exports.deleteService = async (req, res) => {
  try {
    const service = await GroomingService.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Delete image file
    if (service.image_url) {
      const imagePath = path.join(__dirname, '../../public', service.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await GroomingService.delete(req.params.id);

    // ✅ Activity Log
    await ActivityLogger.log(
      req.user,
      'service_delete',
      'grooming_service',
      service.name,
      `Deleted grooming service: ${service.name}`,
      req
    );

    res.status(200).json({
      success: true,
      message: 'Service deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting service',
      error: error.message
    });
  }
};

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

    res.status(200).json({
      success: true,
      data: stats,
      message: 'Service statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching service statistics for owner:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching service statistics',
      error: error.message
    });
  }
};
