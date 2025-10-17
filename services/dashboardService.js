// services/dashboardService.js
const DashboardModel = require('../models/DashboardOwner');

class DashboardService {
  
   // Get comprehensive dashboard statistics
  
  async getDashboardStats(userId) {
    try {
      console.log('Fetching dashboard statistics for user ID:', userId);
      
      // Get user name first
      let userName = 'Owner'; // Default fallback
      if (userId) {
        try {
          const userResult = await DashboardModel.getUserName(userId);
          userName = userResult || 'Owner';
          console.log('Fetched user name:', userName);
        } catch (error) {
          console.error('Error fetching user name:', error);
          // Continue with default name
        }
      }
      
      // Run all dashboard queries in parallel for better performance
      const [
        revenueStats,
        appointmentStats,
        walkInStats,
        customerStats,
        popularServices,
        recentAppointments,
        recentWalkIns,
        recentActivities,
        topGroomers
      ] = await Promise.all([
        this.getRevenueStats(),
        this.getAppointmentStats(),
        this.getWalkInStats(),
        this.getCustomerStats(),
        DashboardModel.getPopularServices(5),
        DashboardModel.getRecentAppointments(5),
        DashboardModel.getRecentWalkIns(5),
        DashboardModel.getRecentActivities(10),
        DashboardModel.getTopGroomers(5, 30)
      ]);
      
      const dashboardData = {
        userName: userName,
        stats: {
          totalRevenue: revenueStats.total,
          revenueGrowth: revenueStats.growth,
          totalAppointments: appointmentStats.total,
          pendingAppointments: appointmentStats.pending,
          totalWalkIns: walkInStats.total,
          todayWalkIns: walkInStats.today,
          totalCustomers: customerStats.total,
          newCustomers: customerStats.newThisMonth
        },
        popularServices: popularServices,
        recentAppointments: recentAppointments,
        recentWalkIns: recentWalkIns,
        recentActivities: recentActivities,
        topGroomers: topGroomers
      };
      
      console.log('✅ Dashboard statistics compiled successfully with user name:', userName);
      return dashboardData;
      
    } catch (error) {
      console.error('❌ Error in getDashboardStats:', error);
      throw new Error('Failed to compile dashboard statistics');
    }
  }

  /**
   * Get revenue statistics with growth calculation
   */
  async getRevenueStats() {
    try {
      const [totalRevenue, currentMonth, lastMonth] = await Promise.all([
        DashboardModel.getTotalRevenue(),
        DashboardModel.getCurrentMonthRevenue(),
        DashboardModel.getLastMonthRevenue()
      ]);
      
      const growth = lastMonth > 0 
        ? Math.round(((currentMonth - lastMonth) / lastMonth) * 100) 
        : 0;
      
      return {
        total: totalRevenue,
        growth: growth
      };
    } catch (error) {
      console.error('❌ Error getting revenue stats:', error);
      return { total: 0, growth: 0 };
    }
  }

  /**
   * Get appointment statistics
   */
  async getAppointmentStats() {
    try {
      const [total, pending] = await Promise.all([
        DashboardModel.getTotalAppointments(),
        DashboardModel.getPendingAppointments()
      ]);
      
      return {
        total: total || 0,
        pending: pending || 0
      };
    } catch (error) {
      console.error('❌ Error getting appointment stats:', error);
      return { total: 0, pending: 0 };
    }
  }

  /**
   * Get walk-in statistics
   */
  async getWalkInStats() {
    try {
      const [total, today] = await Promise.all([
        DashboardModel.getTotalWalkIns(),
        DashboardModel.getTodayWalkIns()
      ]);
      
      return {
        total: total || 0,
        today: today || 0
      };
    } catch (error) {
      console.error('❌ Error getting walk-in stats:', error);
      return { total: 0, today: 0 };
    }
  }

  /**
   * Get customer statistics
   */
  async getCustomerStats() {
    try {
      const [total, newThisMonth] = await Promise.all([
        DashboardModel.getTotalCustomers(),
        DashboardModel.getNewCustomersThisMonth()
      ]);
      
      return {
        total: total || 0,
        newThisMonth: newThisMonth || 0
      };
    } catch (error) {
      console.error('❌ Error getting customer stats:', error);
      return { total: 0, newThisMonth: 0 };
    }
  }

  /**
   * Get revenue chart data for specified days (with debugging)
   */
  async getRevenueChartData(days = 30) {
    try {
      console.log(`=== SERVICE: FETCHING REVENUE CHART DATA FOR ${days} DAYS ===`);
      
      const chartData = await DashboardModel.getRevenueChartData(days);
      console.log('Service received chart data from model:', chartData);
      
      if (!chartData || !Array.isArray(chartData)) {
        console.error('Invalid chart data received from model:', chartData);
        return { labels: [], values: [] };
      }
      
      // Format the data for Chart.js
      const formattedData = {
        labels: chartData.map(item => {
          const date = new Date(item.date);
          let formattedLabel;
          if (days <= 7) {
            formattedLabel = date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
          } else if (days <= 30) {
            formattedLabel = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
          } else {
            formattedLabel = date.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
          }
          console.log(`Formatting date ${item.date} -> ${formattedLabel}`);
          return formattedLabel;
        }),
        values: chartData.map(item => {
          const value = parseFloat(item.revenue) || 0;
          console.log(`Revenue for ${item.date}: ${value}`);
          return value;
        })
      };
      
      console.log('=== FORMATTED CHART DATA ===');
      console.log('Labels:', formattedData.labels);
      console.log('Values:', formattedData.values);
      console.log('Labels count:', formattedData.labels.length);
      console.log('Values count:', formattedData.values.length);
      console.log('Total revenue sum:', formattedData.values.reduce((sum, val) => sum + val, 0));
      
      return formattedData;
      
    } catch (error) {
      console.error('❌ Service error getting revenue chart data:', error);
      console.error('Error stack:', error.stack);
      return { labels: [], values: [] };
    }
  }

  /**
   * Get monthly statistics for specific month/year
   */
  async getMonthlyStats(year, month) {
    try {
      console.log(`📅 Fetching monthly stats for ${month}/${year}`);
      
      const [
        monthlyRevenue,
        monthlyAppointments,
        monthlyWalkIns,
        monthlyNewCustomers,
        topServicesThisMonth
      ] = await Promise.all([
        DashboardModel.getMonthlyRevenue(year, month),
        DashboardModel.getMonthlyAppointments(year, month),
        DashboardModel.getMonthlyWalkIns(year, month),
        DashboardModel.getMonthlyNewCustomers(year, month),
        DashboardModel.getTopServicesForMonth(year, month, 5)
      ]);
      
      const monthlyStats = {
        revenue: monthlyRevenue || 0,
        appointments: monthlyAppointments || 0,
        walkIns: monthlyWalkIns || 0,
        newCustomers: monthlyNewCustomers || 0,
        topServices: topServicesThisMonth || []
      };
      
      console.log('✅ Monthly statistics compiled successfully');
      return monthlyStats;
      
    } catch (error) {
      console.error('❌ Error getting monthly stats:', error);
      throw new Error('Failed to retrieve monthly statistics');
    }
  }

  /**
   * Get top performing groomers
   */
  async getTopGroomers(limit = 5, days = 30) {
    try {
      console.log(`👨‍💼 Fetching top ${limit} groomers for ${days} days`);
      
      const topGroomers = await DashboardModel.getTopGroomers(limit, days);
      
      console.log('✅ Top groomers data compiled successfully');
      return topGroomers;
      
    } catch (error) {
      console.error('❌ Error getting top groomers:', error);
      return []; // Return empty array instead of throwing error
    }
  }

  /**
   * Get recent activities (wrapper method for consistency)
   */
  async getRecentActivities(limit = 10) {
    try {
      console.log(`📝 Fetching recent activities (limit: ${limit})`);
      
      const recentActivities = await DashboardModel.getRecentActivities(limit);
      
      console.log('✅ Recent activities compiled successfully');
      return recentActivities;
      
    } catch (error) {
      console.error('❌ Error getting recent activities:', error);
      return []; // Return empty array instead of throwing error
    }
  }

  /**
   * Get business insights and recommendations
   */
  async getBusinessInsights() {
    try {
      console.log('💡 Generating business insights...');
      
      const [
        peakHours,
        seasonalTrends,
        customerRetention,
        serviceProfitability
      ] = await Promise.all([
        DashboardModel.getPeakBusinessHours(),
        DashboardModel.getSeasonalTrends(),
        DashboardModel.getCustomerRetentionRate(),
        DashboardModel.getServiceProfitability()
      ]);
      
      // Generate insights based on data
      const insights = {
        peakHours: peakHours,
        seasonalTrends: seasonalTrends,
        customerRetention: {
          rate: customerRetention,
          status: customerRetention >= 80 ? 'excellent' : customerRetention >= 60 ? 'good' : 'needs_improvement'
        },
        serviceProfitability: serviceProfitability,
        recommendations: this.generateRecommendations({
          peakHours,
          customerRetention,
          serviceProfitability
        })
      };
      
      console.log('✅ Business insights generated successfully');
      return insights;
      
    } catch (error) {
      console.error('❌ Error getting business insights:', error);
      throw new Error('Failed to retrieve business insights');
    }
  }

  /**
   * Get real-time dashboard updates
   */
  async getRealTimeUpdates() {
    try {
      console.log('⚡ Fetching real-time updates...');
      
      const [
        todayRevenue,
        activeAppointments,
        waitingCustomers,
        availableGroomers
      ] = await Promise.all([
        DashboardModel.getTodayRevenue(),
        DashboardModel.getActiveAppointments(),
        DashboardModel.getWaitingCustomers(),
        DashboardModel.getAvailableGroomers()
      ]);
      
      const updates = {
        todayRevenue: todayRevenue || 0,
        activeAppointments: activeAppointments || [],
        waitingCustomers: waitingCustomers || 0,
        availableGroomers: availableGroomers || 0,
        lastUpdated: new Date().toISOString()
      };
      
      console.log('✅ Real-time updates compiled successfully');
      return updates;
      
    } catch (error) {
      console.error('❌ Error getting real-time updates:', error);
      throw new Error('Failed to retrieve real-time updates');
    }
  }

  /**
   * Generate business recommendations based on data
   */
  generateRecommendations(data) {
    const recommendations = [];
    
    // Peak hours recommendation
    if (data.peakHours && data.peakHours.length > 0) {
      const peakHour = data.peakHours[0];
      recommendations.push({
        type: 'staffing',
        priority: 'high',
        title: 'Optimize Staffing',
        message: `Peak business hours are around ${peakHour.hour}:00. Consider scheduling more groomers during this time.`
      });
    }
    
    // Customer retention recommendation
    if (data.customerRetention < 70) {
      recommendations.push({
        type: 'retention',
        priority: 'high',
        title: 'Improve Customer Retention',
        message: 'Customer retention rate is below optimal. Consider implementing loyalty programs or follow-up services.'
      });
    }
    
    // Service profitability recommendation
    if (data.serviceProfitability && data.serviceProfitability.length > 0) {
      const leastProfitable = data.serviceProfitability[data.serviceProfitability.length - 1];
      if (leastProfitable.profit_margin < 30) {
        recommendations.push({
          type: 'pricing',
          priority: 'medium',
          title: 'Review Service Pricing',
          message: `${leastProfitable.service_name} has low profit margins. Consider adjusting pricing or optimizing costs.`
        });
      }
    }
    
    return recommendations;
  }
}

module.exports = new DashboardService();