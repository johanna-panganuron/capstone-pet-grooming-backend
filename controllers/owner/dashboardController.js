// controllers/owner/dashboardController.js
const DashboardService = require('../../services/dashboardService');

class DashboardController {
  /**
   * Get dashboard overview data
   */
  async getDashboardOverview(req, res) {
    try {
      console.log('=== DASHBOARD OVERVIEW REQUEST ===');
      console.log('User ID:', req.user.id);
      console.log('User Role:', req.user.role);
      
      // Pass the user ID to get the specific user's dashboard data
      const dashboardData = await DashboardService.getDashboardStats(req.user.id);
      
      res.json({
        success: true,
        data: dashboardData,
        message: 'Dashboard data retrieved successfully'
      });
      
    } catch (error) {
      console.error('❌ Dashboard overview error:', error);
      
      // Handle specific error types
      if (error.message === 'DATABASE_CONNECTION_ERROR') {
        return res.status(503).json({
          success: false,
          message: 'Database temporarily unavailable. Please try again later.',
          error: 'SERVICE_UNAVAILABLE'
        });
      }
      
      if (error.message === 'INVALID_DATE_RANGE') {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range provided',
          error: 'BAD_REQUEST'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard data',
        error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  /**
   * Get revenue chart data
   */
  async getRevenueChart(req, res) {
    try {
      console.log('=== REVENUE CHART REQUEST ===');
      
      const days = parseInt(req.query.days) || 30;
      console.log('Requested days:', days);
      
      // Validate days parameter
      const validDays = [7, 30, 90];
      if (!validDays.includes(days)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid days parameter. Must be 7, 30, or 90',
          error: 'INVALID_PARAMETER'
        });
      }
      
      const chartData = await DashboardService.getRevenueChartData(days);
      
      res.json({
        success: true,
        data: chartData,
        message: `Revenue chart data for ${days} days retrieved successfully`
      });
      
    } catch (error) {
      console.error('❌ Revenue chart error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve revenue chart data',
        error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  /**
   * Get monthly statistics
   */
  async getMonthlyStats(req, res) {
    try {
      console.log('=== MONTHLY STATS REQUEST ===');
      
      const { year, month } = req.query;
      const currentYear = year ? parseInt(year) : new Date().getFullYear();
      const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
      
      console.log(`Requested month: ${currentMonth}/${currentYear}`);
      
      // Validate month and year
      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: 'Invalid month. Must be between 1 and 12',
          error: 'INVALID_MONTH'
        });
      }
      
      if (currentYear < 2020 || currentYear > new Date().getFullYear()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid year',
          error: 'INVALID_YEAR'
        });
      }
      
      const monthlyStats = await DashboardService.getMonthlyStats(currentYear, currentMonth);
      
      res.json({
        success: true,
        data: monthlyStats,
        message: `Monthly statistics for ${currentMonth}/${currentYear} retrieved successfully`
      });
      
    } catch (error) {
      console.error('❌ Monthly stats error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve monthly statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  /**
   * Get top performing groomers
   */
  async getTopGroomers(req, res) {
    try {
      console.log('=== TOP GROOMERS REQUEST ===');
      
      const limit = parseInt(req.query.limit) || 5;
      const days = parseInt(req.query.days) || 30;
      
      console.log(`Requested top ${limit} groomers for ${days} days`);
      
      const topGroomers = await DashboardService.getTopGroomers(limit, days);
      
      res.json({
        success: true,
        data: topGroomers,
        message: `Top ${limit} groomers retrieved successfully`
      });
      
    } catch (error) {
      console.error('❌ Top groomers error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve top groomers data',
        error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  /**
   * Get business insights
   */
  async getBusinessInsights(req, res) {
    try {
      console.log('=== BUSINESS INSIGHTS REQUEST ===');
      
      const insights = await DashboardService.getBusinessInsights();
      
      res.json({
        success: true,
        data: insights,
        message: 'Business insights retrieved successfully'
      });
      
    } catch (error) {
      console.error('❌ Business insights error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve business insights',
        error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  /**
   * Get real-time dashboard updates
   */
  async getRealTimeUpdates(req, res) {
    try {
      console.log('=== REAL-TIME UPDATES REQUEST ===');
      
      const updates = await DashboardService.getRealTimeUpdates();
      
      res.json({
        success: true,
        data: updates,
        message: 'Real-time updates retrieved successfully'
      });
      
    } catch (error) {
      console.error('❌ Real-time updates error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve real-time updates',
        error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}

module.exports = new DashboardController();