// controllers/owner/activityLogController.js
const ActivityLog = require('../../models/ActivityLog');

const activityLogController = {
  // Get all activity logs with filtering and pagination
 // Get all activity logs with filtering and pagination
async getAllActivities(req, res) {
  try {
    console.log('=== GET ALL ACTIVITIES ===');
    console.log('Query params:', req.query);

    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      user_role: req.query.user_role,
      action: req.query.action,
      target_type: req.query.target_type,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      search: req.query.search
    };

    // Remove empty filters but keep pagination
    Object.keys(filters).forEach(key => {
      if (filters[key] === '' || filters[key] === null || filters[key] === undefined) {
        delete filters[key];
      }
    });

    console.log('Applied filters:', filters);

    const result = await ActivityLog.findAll(filters);

    console.log('✅ Activities fetched successfully');
    console.log('Total activities:', result.pagination.total);
    console.log('Date range applied:', { date_from: filters.date_from, date_to: filters.date_to });

    res.json({
      success: true,
      message: 'Activities fetched successfully',
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('❌ Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities',
      error: error.message
    });
  }
},

  // Get activity statistics
  async getStats(req, res) {
    try {
      console.log('=== GET ACTIVITY STATS ===');
      console.log('Query params:', req.query);

      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove empty filters
      Object.keys(filters).forEach(key => {
        if (!filters[key] || filters[key] === '') {
          delete filters[key];
        }
      });

      console.log('Applied filters for stats:', filters);

      const stats = await ActivityLog.getStats(filters);

      console.log('Activity stats fetched successfully');

      res.json({
        success: true,
        message: 'Activity statistics fetched successfully',
        data: stats
      });

    } catch (error) {
      console.error('Error fetching activity stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch activity statistics',
        error: error.message
      });
    }
  },

  // Get filter options for dropdowns
  async getFilterOptions(req, res) {
    try {
      console.log('=== GET FILTER OPTIONS ===');

      const options = await ActivityLog.getFilterOptions();

      console.log('Filter options fetched successfully');

      res.json({
        success: true,
        message: 'Filter options fetched successfully',
        data: options
      });

    } catch (error) {
      console.error('Error fetching filter options:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch filter options',
        error: error.message
      });
    }
  }
};

module.exports = activityLogController;