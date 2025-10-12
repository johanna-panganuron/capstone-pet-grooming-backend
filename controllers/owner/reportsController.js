// controllers/owner/reportsController.js
const ReportsModel = require('../../models/ReportsModel');
const ExcelJS = require('exceljs');
const moment = require('moment');

/**
 * Calculate date range based on selection
 */
const calculateDateRange = (dateRange, startDate, endDate) => {
  const now = moment();
  
  switch (dateRange) {
    case 'today':
      return {
        startDate: now.startOf('day').format('YYYY-MM-DD'),
        endDate: now.endOf('day').format('YYYY-MM-DD')
      };
    case 'week':
      return {
        startDate: now.startOf('week').format('YYYY-MM-DD'),
        endDate: now.endOf('week').format('YYYY-MM-DD')
      };
    case 'month':
      return {
        startDate: now.startOf('month').format('YYYY-MM-DD'),
        endDate: now.endOf('month').format('YYYY-MM-DD')
      };
    case 'quarter':
      return {
        startDate: now.startOf('quarter').format('YYYY-MM-DD'),
        endDate: now.endOf('quarter').format('YYYY-MM-DD')
      };
    case 'year':
      return {
        startDate: now.startOf('year').format('YYYY-MM-DD'),
        endDate: now.endOf('year').format('YYYY-MM-DD')
      };
    case 'custom':
      return {
        startDate: startDate,
        endDate: endDate
      };
    default:
      return {
        startDate: now.startOf('month').format('YYYY-MM-DD'),
        endDate: now.endOf('month').format('YYYY-MM-DD')
      };
  }
};

/**
 * Get previous period for comparison
 */
const getPreviousPeriod = (dateFilters) => {
  const start = moment(dateFilters.startDate);
  const end = moment(dateFilters.endDate);
  const duration = end.diff(start, 'days');
  
  return {
    startDate: start.clone().subtract(duration + 1, 'days').format('YYYY-MM-DD'),
    endDate: start.clone().subtract(1, 'days').format('YYYY-MM-DD')
  };
};

/**
 * Get comprehensive reports based on filters
 */
const getReports = async (req, res) => {
  try {
    const { dateRange, reportType, startDate, endDate } = req.query;
    
    console.log('=== REPORTS CONTROLLER ===');
    console.log('Date Range:', dateRange);
    console.log('Report Type:', reportType);
    console.log('Custom Dates:', { startDate, endDate });
    
    // Calculate date range
    const dateFilters = calculateDateRange(dateRange, startDate, endDate);
    console.log('Calculated Date Filters:', dateFilters);
    
    let reportData = {};
    
    // Fetch data based on report type
    switch (reportType) {
      case 'overview':
        reportData = await getOverviewData(dateFilters);
        break;
      case 'revenue':
        reportData.revenue = await getRevenueData(dateFilters);
        break;
      case 'services':
        reportData.services = await getServicesData(dateFilters);
        break;
      case 'customers':
        reportData.customers = await getCustomersData(dateFilters);
        break;
      case 'staff':
        reportData.staff = await getStaffData(dateFilters);
        break;
      default:
        reportData = await getOverviewData(dateFilters);
    }
    
    console.log('Report Data Structure:', JSON.stringify(reportData, null, 2));
    
    console.log('✅ Report data generated successfully');
    
    res.json({
      success: true,
      data: reportData,
      dateRange: dateFilters
    });
    
  } catch (error) {
    console.error('❌ Error in getReports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate reports',
      error: error.message
    });
  }
};

/**
 * Get overview data including key metrics
 */
const getOverviewData = async (dateFilters) => {
    try {
      const [
        overviewStats,
        previousPeriodStats,
        revenueData,
        topServices // This is the problem - no growth calculation
      ] = await Promise.all([
        ReportsModel.getOverviewStats(dateFilters),
        ReportsModel.getOverviewStats(getPreviousPeriod(dateFilters)),
        ReportsModel.getRevenueData(dateFilters),
        // Change this line:
        getServicesData(dateFilters) // Use the same function that calculates growth
      ]);
      
      // Calculate percentage changes
      const calculateChange = (current, previous) => {
        if (!previous || previous === 0) return 0;
        return ((current - previous) / previous * 100).toFixed(1);
      };
      
      return {
        overview: {
          totalRevenue: overviewStats.totalRevenue || 0,
          totalBookings: overviewStats.totalBookings || 0,
          activeCustomers: overviewStats.activeCustomers || 0,
          averageOrderValue: overviewStats.averageOrderValue || 0,
          revenueChange: calculateChange(overviewStats.totalRevenue, previousPeriodStats.totalRevenue),
          bookingsChange: calculateChange(overviewStats.totalBookings, previousPeriodStats.totalBookings),
          customersChange: calculateChange(overviewStats.activeCustomers, previousPeriodStats.activeCustomers),
          aovChange: calculateChange(overviewStats.averageOrderValue, previousPeriodStats.averageOrderValue)
        },
        revenue: revenueData,
        services: topServices.slice(0, 5) // Limit to top 5 for overview
      };
      
    } catch (error) {
      console.error('Error in getOverviewData:', error);
      throw error;
    }
  };

/**
 * Get detailed revenue data
 */
const getRevenueData = async (dateFilters) => {
  try {
    const [
      revenueBreakdown,
      dailyRevenue,
      paymentMethodBreakdown
    ] = await Promise.all([
      ReportsModel.getRevenueBreakdown(dateFilters),
      ReportsModel.getDailyRevenue(dateFilters),
      ReportsModel.getPaymentMethodBreakdown(dateFilters)
    ]);
    
    return {
      appointmentsRevenue: revenueBreakdown.appointmentsRevenue || 0,
      walkInRevenue: revenueBreakdown.walkInRevenue || 0,
      addonRevenue: revenueBreakdown.addonRevenue || 0,
      chartData: dailyRevenue.map(day => ({
        label: moment(day.date).format('MMM DD'),
        value: day.revenue
      })),
      paymentMethods: paymentMethodBreakdown
    };
    
  } catch (error) {
    console.error('Error in getRevenueData:', error);
    throw error;
  }
};

/**
 * Get services performance data
 */
const getServicesData = async (dateFilters) => {
  try {
    const [
      servicesPerformance,
      previousPeriodServices
    ] = await Promise.all([
      ReportsModel.getServicesPerformance(dateFilters),
      ReportsModel.getServicesPerformance(getPreviousPeriod(dateFilters))
    ]);
    
    // Calculate growth for each service
    const servicesWithGrowth = servicesPerformance.map(service => {
      const previousService = previousPeriodServices.find(p => p.id === service.id);
      const previousRevenue = previousService ? previousService.revenue : 0;
      const growth = previousRevenue > 0 ? 
        ((service.revenue - previousRevenue) / previousRevenue * 100).toFixed(1) : 
        (service.revenue > 0 ? 100 : 0);
      
      return {
        ...service,
        growth: parseFloat(growth)
      };
    });
    
    return servicesWithGrowth;
    
  } catch (error) {
    console.error('Error in getServicesData:', error);
    throw error;
  }
};

/**
 * Get customer analytics data
 */
const getCustomersData = async (dateFilters) => {
  try {
    const [
      customerMetrics,
      topCustomers,
      customerRetention
    ] = await Promise.all([
      ReportsModel.getCustomerMetrics(dateFilters),
      ReportsModel.getTopCustomers(dateFilters, 10),
      ReportsModel.getCustomerRetention(dateFilters)
    ]);
    
    return {
      newCustomers: customerMetrics.newCustomers || 0,
      returningCustomers: customerMetrics.returningCustomers || 0,
      retentionRate: customerRetention.retentionRate || 0,
      averageVisits: customerMetrics.averageVisits || 0,
      topCustomers: topCustomers
    };
    
  } catch (error) {
    console.error('Error in getCustomersData:', error);
    throw error;
  }
};

/**
 * Get staff performance data
 */
const getStaffData = async (dateFilters) => {
  try {
    const staffPerformance = await ReportsModel.getStaffPerformance(dateFilters);
    
    return staffPerformance;
    
  } catch (error) {
    console.error('Error in getStaffData:', error);
    throw error;
  }
};

/**
 * Export reports to Excel
 */
const exportReports = async (req, res) => {
  try {
    const { dateRange, reportType, startDate, endDate } = req.query;
    
    console.log('=== EXPORT REPORTS ===');
    console.log('Export Type:', reportType);
    
    // Calculate date range
    const dateFilters = calculateDateRange(dateRange, startDate, endDate);
    
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pet Grooming System';
    workbook.created = new Date();
    
    // Add worksheet based on report type
    switch (reportType) {
      case 'overview':
        await addOverviewSheet(workbook, dateFilters);
        break;
      case 'revenue':
        await addRevenueSheet(workbook, dateFilters);
        break;
      case 'services':
        await addServicesSheet(workbook, dateFilters);
        break;
      case 'customers':
        await addCustomersSheet(workbook, dateFilters);
        break;
      case 'staff':
        await addStaffSheet(workbook, dateFilters);
        break;
      default:
        await addOverviewSheet(workbook, dateFilters);
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report_${reportType}_${moment().format('YYYY-MM-DD')}.xlsx`);
    
    // Write to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('❌ Error exporting reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export reports',
      error: error.message
    });
  }
};

/**
 * Add overview sheet to workbook
 */
const addOverviewSheet = async (workbook, dateFilters) => {
  const overviewData = await getOverviewData(dateFilters);
  const worksheet = workbook.addWorksheet('Overview');
  
  // Add headers
  worksheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Value', key: 'value', width: 20 },
    { header: 'Change (%)', key: 'change', width: 15 }
  ];
  
  // Add overview data
  worksheet.addRow({
    metric: 'Total Revenue',
    value: `₱${overviewData.overview.totalRevenue.toLocaleString()}`,
    change: `${overviewData.overview.revenueChange}%`
  });
  
  worksheet.addRow({
    metric: 'Total Bookings',
    value: overviewData.overview.totalBookings,
    change: `${overviewData.overview.bookingsChange}%`
  });
  
  worksheet.addRow({
    metric: 'Active Customers',
    value: overviewData.overview.activeCustomers,
    change: `${overviewData.overview.customersChange}%`
  });
  
  worksheet.addRow({
    metric: 'Average Order Value',
    value: `₱${overviewData.overview.averageOrderValue.toLocaleString()}`,
    change: `${overviewData.overview.aovChange}%`
  });
  
  // Style headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '6B46C1' }
  };
};

/**
 * Add revenue sheet to workbook
 */
const addRevenueSheet = async (workbook, dateFilters) => {
  const revenueData = await getRevenueData(dateFilters);
  const worksheet = workbook.addWorksheet('Revenue');
  
  // Revenue breakdown section
  worksheet.addRow(['Revenue Breakdown']);
  worksheet.addRow(['Type', 'Amount']);
  worksheet.addRow(['Appointments', `₱${revenueData.appointmentsRevenue.toLocaleString()}`]);
  worksheet.addRow(['Walk-ins', `₱${revenueData.walkInRevenue.toLocaleString()}`]);
  worksheet.addRow(['Add-ons', `₱${revenueData.addonRevenue.toLocaleString()}`]);
  
  worksheet.addRow([]); // Empty row
  
  // Daily revenue section
  worksheet.addRow(['Daily Revenue']);
  worksheet.addRow(['Date', 'Revenue']);
  
  revenueData.chartData.forEach(day => {
    worksheet.addRow([day.label, `₱${day.value.toLocaleString()}`]);
  });
  
  // Style headers
  worksheet.getRow(1).font = { bold: true, size: 14 };
  worksheet.getRow(2).font = { bold: true };
  worksheet.getRow(8).font = { bold: true, size: 14 };
  worksheet.getRow(9).font = { bold: true };
};

/**
 * Add services sheet to workbook
 */
const addServicesSheet = async (workbook, dateFilters) => {
  const servicesData = await getServicesData(dateFilters);
  const worksheet = workbook.addWorksheet('Services');
  
  // Add headers
  worksheet.columns = [
    { header: 'Service Name', key: 'name', width: 30 },
    { header: 'Bookings', key: 'bookings', width: 15 },
    { header: 'Revenue', key: 'revenue', width: 20 },
    { header: 'Avg Price', key: 'avgPrice', width: 15 },
    { header: 'Growth (%)', key: 'growth', width: 15 }
  ];
  
  // Add services data
  servicesData.forEach(service => {
    worksheet.addRow({
      name: service.name,
      bookings: service.bookings,
      revenue: `₱${service.revenue.toLocaleString()}`,
      avgPrice: `₱${service.averagePrice.toLocaleString()}`,
      growth: `${service.growth}%`
    });
  });
  
  // Style headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '6B46C1' }
  };
};

/**
 * Add customers sheet to workbook
 */
const addCustomersSheet = async (workbook, dateFilters) => {
  const customersData = await getCustomersData(dateFilters);
  const worksheet = workbook.addWorksheet('Customers');
  
  // Customer metrics
  worksheet.addRow(['Customer Metrics']);
  worksheet.addRow(['Metric', 'Value']);
  worksheet.addRow(['New Customers', customersData.newCustomers]);
  worksheet.addRow(['Returning Customers', customersData.returningCustomers]);
  worksheet.addRow(['Retention Rate', `${customersData.retentionRate}%`]);
  worksheet.addRow(['Average Visits', customersData.averageVisits]);
  
  worksheet.addRow([]); // Empty row
  
  // Top customers
  worksheet.addRow(['Top Customers']);
  worksheet.addRow(['Name', 'Email', 'Total Visits', 'Total Spent']);
  
  customersData.topCustomers.forEach(customer => {
    worksheet.addRow([
      customer.name,
      customer.email,
      customer.totalVisits,
      `₱${customer.totalSpent.toLocaleString()}`
    ]);
  });
  
  // Style headers
  worksheet.getRow(1).font = { bold: true, size: 14 };
  worksheet.getRow(2).font = { bold: true };
  worksheet.getRow(8).font = { bold: true, size: 14 };
  worksheet.getRow(9).font = { bold: true };
};

/**
 * Add staff sheet to workbook
 */
const addStaffSheet = async (workbook, dateFilters) => {
  const staffData = await getStaffData(dateFilters);
  const worksheet = workbook.addWorksheet('Staff Performance');
  
  // Add headers
  worksheet.columns = [
    { header: 'Staff Name', key: 'name', width: 25 },
    { header: 'Role', key: 'role', width: 15 },
    { header: 'Services Completed', key: 'services', width: 20 },
    { header: 'Revenue Generated', key: 'revenue', width: 20 },
    { header: 'Average Rating', key: 'rating', width: 15 },
    { header: 'Efficiency (%)', key: 'efficiency', width: 15 }
  ];
  
  // Add staff data
  staffData.forEach(staff => {
    worksheet.addRow({
      name: staff.name,
      role: staff.role,
      services: staff.servicesCompleted,
      revenue: `₱${staff.revenueGenerated.toLocaleString()}`,
      rating: `${staff.averageRating}/5`,
      efficiency: `${staff.efficiency}%`
    });
  });
  
  // Style headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '6B46C1' }
  };
};

module.exports = {
  getReports,
  exportReports
};