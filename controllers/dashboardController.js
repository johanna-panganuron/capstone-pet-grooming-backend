// controllers/dashboardController.js
const Dashboard = require('../models/Dashboard');

class DashboardController {
  static async getDashboardData(req, res) {
    try {
      const userId = req.user.id;
      
      // Get user stats and quick actions
      const [userStats] = await Promise.all([
        Dashboard.getUserStats(userId),
      ]);

      res.json({
        success: true,
        data: {
          user_stats: userStats
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data',
        error: error.message
      });
    }
  }

  static async getUserOverview(req, res) {
    try {
      const userId = req.user.id;
      const userStats = await Dashboard.getUserStats(userId);

      res.json({
        success: true,
        data: userStats
      });
    } catch (error) {
      console.error('Error fetching user overview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user overview',
        error: error.message
      });
    }
  }
}

module.exports = DashboardController;