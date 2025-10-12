// controllers/staff/dashboardController.js
const DashboardStaff = require('../../models/DashboardStaff');

class DashboardStaffController {
    // Get dashboard statistics
    static async getDashboardStats(req, res) {
      try {
        console.log('=== DASHBOARD STATS REQUEST ===');
        console.log('User:', req.user);

        const stats = await DashboardStaff.getDashboardStats();
        
        console.log('Dashboard stats fetched successfully:', stats);
        
        res.status(200).json({
          success: true,
          stats
        });
      } catch (error) {
        console.error('Error in getDashboardStats:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch dashboard statistics',
          error: error.message
        });
      }
    }

    // Get today's schedule
    static async getTodaySchedule(req, res) {
      try {
        console.log('=== TODAY SCHEDULE REQUEST ===');
        console.log('User:', req.user);
        console.log('Query params:', req.query);

        const { filter = 'all' } = req.query;
        const schedule = await DashboardStaff.getTodaySchedule(filter);
        
        console.log(`Today's schedule fetched (filter: ${filter}):`, schedule?.length || 0, 'appointments');
        
        res.status(200).json({
          success: true,
          schedule
        });
      } catch (error) {
        console.error('Error in getTodaySchedule:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch today\'s schedule',
          error: error.message
        });
      }
    }

    // Get recent activities
    static async getRecentActivities(req, res) {
      try {
        console.log('=== RECENT ACTIVITIES REQUEST ===');
        console.log('User:', req.user);

        const activities = await DashboardStaff.getRecentActivities();
        
        console.log('Recent activities fetched:', activities?.length || 0, 'activities');
        
        res.status(200).json({
          success: true,
          activities
        });
      } catch (error) {
        console.error('Error in getRecentActivities:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch recent activities',
          error: error.message
        });
      }
    }

    // Get user profile - ADD THIS METHOD
    static async getUserProfile(req, res) {
      try {
        console.log('=== USER PROFILE REQUEST ===');
        console.log('User ID:', req.user?.id);
        console.log('Full user object:', req.user);
    
        if (!req.user || !req.user.id) {
          return res.status(401).json({
            success: false,
            message: 'User not authenticated'
          });
        }
    
        const userProfile = await DashboardStaff.getUserProfile(req.user.id);
        
        console.log('User profile fetched successfully:', userProfile);
        
        res.status(200).json({
          success: true,
          user: userProfile
        });
      } catch (error) {
        console.error('❌ Error in getUserProfile controller:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch user profile',
          error: error.message
        });
      }
    }
}

module.exports = DashboardStaffController;