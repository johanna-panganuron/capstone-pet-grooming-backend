// models/ReportsModel.js
const db = require('./db');

class ReportsModel {
  
  /**
   * Get overview statistics for the given date range
   */
  async getOverviewStats(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      console.log('Getting overview stats for:', { startDate, endDate });
      
      // Query appointments
      const appointmentsQuery = `
        SELECT 
          COUNT(*) as appointmentCount,
          COALESCE(SUM(a.total_amount), 0) as appointmentRevenue,
          COUNT(DISTINCT a.owner_id) as appointmentCustomers
        FROM appointments a
        WHERE a.status = 'completed'
          AND a.payment_status = 'paid'
          AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
      `;
      
      // Query walk-ins
      const walkInQuery = `
        SELECT 
          COUNT(*) as walkInCount,
          COALESCE(SUM(wb.total_amount), 0) as walkInRevenue,
          COUNT(DISTINCT wb.owner_id) as walkInCustomers
        FROM walk_in_bookings wb
        WHERE wb.status = 'completed'
          AND wb.payment_status = 'paid'
          AND DATE(wb.created_at) BETWEEN ? AND ?
      `;
      
      const [appointmentsResult] = await db.query(appointmentsQuery, [startDate, endDate]);
      const [walkInResult] = await db.query(walkInQuery, [startDate, endDate]);
      
      const appointments = appointmentsResult[0] || {};
      const walkIns = walkInResult[0] || {};
      
      const totalRevenue = parseFloat(appointments.appointmentRevenue || 0) + parseFloat(walkIns.walkInRevenue || 0);
      const totalBookings = parseInt(appointments.appointmentCount || 0) + parseInt(walkIns.walkInCount || 0);
      
      // Get unique customers across both tables
      const uniqueCustomersQuery = `
        SELECT COUNT(DISTINCT customer_id) as uniqueCustomers FROM (
          SELECT DISTINCT a.owner_id as customer_id
          FROM appointments a
          WHERE a.status = 'completed' 
            AND a.payment_status = 'paid'
            AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
          UNION
          SELECT DISTINCT wb.owner_id as customer_id
          FROM walk_in_bookings wb
          WHERE wb.status = 'completed'
            AND wb.payment_status = 'paid'
            AND DATE(wb.created_at) BETWEEN ? AND ?
        ) combined_customers
      `;
      
      const [customersResult] = await db.query(uniqueCustomersQuery, [startDate, endDate, startDate, endDate]);
      const activeCustomers = parseInt(customersResult[0]?.uniqueCustomers || 0);
      
      const averageOrderValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
      
      console.log('Overview stats result:', {
        totalRevenue,
        totalBookings,
        activeCustomers,
        averageOrderValue
      });
      
      return {
        totalRevenue,
        totalBookings,
        activeCustomers,
        averageOrderValue
      };
      
    } catch (error) {
      console.error('Error in getOverviewStats:', error);
      throw error;
    }
  }
  
  /**
   * Get revenue breakdown by type
   */
  async getRevenueBreakdown(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      // Get appointments revenue
      const appointmentsQuery = `
        SELECT 
          COALESCE(SUM(a.base_price), 0) as baseRevenue,
          COALESCE(SUM(a.matted_coat_fee), 0) as mattedFees,
          COALESCE(SUM(a.total_amount), 0) as totalRevenue
        FROM appointments a
        WHERE a.status = 'completed'
          AND a.payment_status = 'paid'
          AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
      `;
      
      // Get walk-ins revenue
      const walkInQuery = `
        SELECT 
          COALESCE(SUM(wb.base_price), 0) as baseRevenue,
          COALESCE(SUM(wb.matted_coat_fee), 0) as mattedFees,
          COALESCE(SUM(wb.total_amount), 0) as totalRevenue
        FROM walk_in_bookings wb
        WHERE wb.status = 'completed'
          AND wb.payment_status = 'paid'
          AND DATE(wb.created_at) BETWEEN ? AND ?
      `;
      
      // Get addon services from walk-in booking services
      const addonQuery = `
        SELECT COALESCE(SUM(wbs.price), 0) as addonRevenue
        FROM walk_in_booking_services wbs
        JOIN walk_in_bookings wb ON wbs.walk_in_booking_id = wb.id
        WHERE wbs.is_addon = 1
          AND wb.status = 'completed'
          AND wb.payment_status = 'paid'
          AND DATE(wb.created_at) BETWEEN ? AND ?
      `;
      
      const [appointmentsResult] = await db.query(appointmentsQuery, [startDate, endDate]);
      const [walkInResult] = await db.query(walkInQuery, [startDate, endDate]);
      const [addonResult] = await db.query(addonQuery, [startDate, endDate]);
      
      return {
        appointmentsRevenue: parseFloat(appointmentsResult[0]?.totalRevenue || 0),
        walkInRevenue: parseFloat(walkInResult[0]?.totalRevenue || 0),
        addonRevenue: parseFloat(addonResult[0]?.addonRevenue || 0)
      };
      
    } catch (error) {
      console.error('Error in getRevenueBreakdown:', error);
      throw error;
    }
  }
  
  /**
   * Get daily revenue for chart
   */
  async getDailyRevenue(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          revenue_date as date,
          SUM(daily_revenue) as revenue
        FROM (
          SELECT 
            DATE(COALESCE(a.actual_date, a.preferred_date)) as revenue_date,
            SUM(a.total_amount) as daily_revenue
          FROM appointments a
          WHERE a.status = 'completed'
            AND a.payment_status = 'paid'
            AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
          GROUP BY DATE(COALESCE(a.actual_date, a.preferred_date))
          
          UNION ALL
          
          SELECT 
            DATE(wb.created_at) as revenue_date,
            SUM(wb.total_amount) as daily_revenue
          FROM walk_in_bookings wb
          WHERE wb.status = 'completed'
            AND wb.payment_status = 'paid'
            AND DATE(wb.created_at) BETWEEN ? AND ?
          GROUP BY DATE(wb.created_at)
        ) combined_revenue
        GROUP BY revenue_date
        ORDER BY revenue_date ASC
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate]);
      
      return results.map(row => ({
        date: row.date,
        revenue: parseFloat(row.revenue || 0)
      }));
      
    } catch (error) {
      console.error('Error in getDailyRevenue:', error);
      throw error;
    }
  }
  
  /**
   * Get payment method breakdown
   */
  async getPaymentMethodBreakdown(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          payment_method,
          COUNT(*) as count,
          SUM(total_amount) as total
        FROM (
          SELECT a.payment_method, a.total_amount
          FROM appointments a
          WHERE a.status = 'completed'
            AND a.payment_status = 'paid'
            AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
          
          UNION ALL
          
          SELECT wb.payment_method, wb.total_amount
          FROM walk_in_bookings wb
          WHERE wb.status = 'completed'
            AND wb.payment_status = 'paid'
            AND DATE(wb.created_at) BETWEEN ? AND ?
        ) combined_payments
        GROUP BY payment_method
        ORDER BY total DESC
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate]);
      
      return results.map(row => ({
        method: row.payment_method,
        count: parseInt(row.count),
        total: parseFloat(row.total || 0)
      }));
      
    } catch (error) {
      console.error('Error in getPaymentMethodBreakdown:', error);
      throw error;
    }
  }
  
  /**
   * Get revenue data with chart information
   */
  async getRevenueData(dateFilters) {
    try {
      const [
        breakdown,
        dailyRevenue,
        paymentMethods
      ] = await Promise.all([
        this.getRevenueBreakdown(dateFilters),
        this.getDailyRevenue(dateFilters),
        this.getPaymentMethodBreakdown(dateFilters)
      ]);
      
      return {
        ...breakdown,
        chartData: dailyRevenue,
        paymentMethods
      };
      
    } catch (error) {
      console.error('Error in getRevenueData:', error);
      throw error;
    }
  }
  
  /**
   * Get top performing services
   */
  async getTopServices(dateFilters, limit = 10) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          gs.id,
          gs.name,
          COUNT(service_bookings.id) as bookings,
          SUM(service_bookings.amount) as revenue,
          AVG(service_bookings.amount) as averagePrice
        FROM grooming_services gs
        LEFT JOIN (
          SELECT a.service_id as service_id, a.id, a.total_amount as amount
          FROM appointments a
          WHERE a.status = 'completed'
            AND a.payment_status = 'paid'
            AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
          
          UNION ALL
          
          SELECT wb.service_id as service_id, wb.id, wb.total_amount as amount
          FROM walk_in_bookings wb
          WHERE wb.status = 'completed'
            AND wb.payment_status = 'paid'
            AND DATE(wb.created_at) BETWEEN ? AND ?
        ) service_bookings ON gs.id = service_bookings.service_id
        WHERE gs.status = 'available'
        GROUP BY gs.id, gs.name
        HAVING bookings > 0
        ORDER BY revenue DESC
        LIMIT ?
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate, limit]);
      
      return results.map(row => ({
        id: row.id,
        name: row.name,
        bookings: parseInt(row.bookings || 0),
        revenue: parseFloat(row.revenue || 0),
        averagePrice: parseFloat(row.averagePrice || 0)
      }));
      
    } catch (error) {
      console.error('Error in getTopServices:', error);
      throw error;
    }
  }
  
  /**
   * Get services performance data
   */
  async getServicesPerformance(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          gs.id,
          gs.name,
          gs.category,
          COUNT(service_bookings.id) as bookings,
          COALESCE(SUM(service_bookings.amount), 0) as revenue,
          COALESCE(AVG(service_bookings.amount), 0) as averagePrice,
          COUNT(DISTINCT service_bookings.customer_id) as uniqueCustomers
        FROM grooming_services gs
        LEFT JOIN (
          SELECT a.service_id, a.id, a.total_amount as amount, a.owner_id as customer_id
          FROM appointments a
          WHERE a.status = 'completed'
            AND a.payment_status = 'paid'
            AND DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
          
          UNION ALL
          
          SELECT wb.service_id, wb.id, wb.total_amount as amount, wb.owner_id as customer_id
          FROM walk_in_bookings wb
          WHERE wb.status = 'completed'
            AND wb.payment_status = 'paid'
            AND DATE(wb.created_at) BETWEEN ? AND ?
        ) service_bookings ON gs.id = service_bookings.service_id
        WHERE gs.status = 'available'
        GROUP BY gs.id, gs.name, gs.category
        ORDER BY revenue DESC
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate]);
      
      return results.map(row => ({
        id: row.id,
        name: row.name,
        category: row.category,
        bookings: parseInt(row.bookings || 0),
        revenue: parseFloat(row.revenue || 0),
        averagePrice: parseFloat(row.averagePrice || 0),
        uniqueCustomers: parseInt(row.uniqueCustomers || 0)
      }));
      
    } catch (error) {
      console.error('Error in getServicesPerformance:', error);
      throw error;
    }
  }
  
  /**
   * Get customer metrics
   */
  async getCustomerMetrics(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const newCustomersQuery = `
        SELECT COUNT(DISTINCT u.id) as newCustomers
        FROM users u
        WHERE u.role = 'pet_owner'
          AND DATE(u.created_at) BETWEEN ? AND ?
      `;
      
      const returningCustomersQuery = `
        SELECT COUNT(DISTINCT customer_id) as returningCustomers
        FROM (
          SELECT DISTINCT a.owner_id as customer_id
          FROM appointments a
          WHERE DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
            AND a.status = 'completed'
            AND a.owner_id IN (
              SELECT DISTINCT a2.owner_id
              FROM appointments a2
              WHERE DATE(COALESCE(a2.actual_date, a2.preferred_date)) < ?
                AND a2.status = 'completed'
              UNION
              SELECT DISTINCT wb2.owner_id
              FROM walk_in_bookings wb2
              WHERE DATE(wb2.created_at) < ?
                AND wb2.status = 'completed'
            )
          
          UNION
          
          SELECT DISTINCT wb.owner_id as customer_id
          FROM walk_in_bookings wb
          WHERE DATE(wb.created_at) BETWEEN ? AND ?
            AND wb.status = 'completed'
            AND wb.owner_id IN (
              SELECT DISTINCT a2.owner_id
              FROM appointments a2
              WHERE DATE(COALESCE(a2.actual_date, a2.preferred_date)) < ?
                AND a2.status = 'completed'
              UNION
              SELECT DISTINCT wb2.owner_id
              FROM walk_in_bookings wb2
              WHERE DATE(wb2.created_at) < ?
                AND wb2.status = 'completed'
            )
        ) as returning_customers_temp
      `;
      
      const averageVisitsQuery = `
        SELECT AVG(visit_count) as averageVisits
        FROM (
          SELECT customer_id, COUNT(*) as visit_count
          FROM (
            SELECT a.owner_id as customer_id
            FROM appointments a
            WHERE DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
              AND a.status = 'completed'
            
            UNION ALL
            
            SELECT wb.owner_id as customer_id
            FROM walk_in_bookings wb
            WHERE DATE(wb.created_at) BETWEEN ? AND ?
              AND wb.status = 'completed'
          ) as all_visits_temp
          GROUP BY customer_id
        ) as customer_visits_temp
      `;
      
      const [
        [newCustomersResult],
        [returningCustomersResult],
        [averageVisitsResult]
      ] = await Promise.all([
        db.query(newCustomersQuery, [startDate, endDate]),
        db.query(returningCustomersQuery, [startDate, endDate, startDate, startDate, startDate, endDate, startDate, startDate]),
        db.query(averageVisitsQuery, [startDate, endDate, startDate, endDate])
      ]);
      
      return {
        newCustomers: parseInt(newCustomersResult[0]?.newCustomers || 0),
        returningCustomers: parseInt(returningCustomersResult[0]?.returningCustomers || 0),
        averageVisits: parseFloat(averageVisitsResult[0]?.averageVisits || 0).toFixed(1)
      };
      
    } catch (error) {
      console.error('Error in getCustomerMetrics:', error);
      throw error;
    }
  }
  
  /**
   * Get top customers
   */
  async getTopCustomers(dateFilters, limit = 10) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          u.id,
          u.name,
          u.email,
          COUNT(customer_visits.id) as totalVisits,
          SUM(customer_visits.amount) as totalSpent,
          AVG(customer_visits.amount) as averageSpent
        FROM users u
        JOIN (
          SELECT a.owner_id as customer_id, a.id, a.total_amount as amount
          FROM appointments a
          WHERE DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
            AND a.status = 'completed'
            AND a.payment_status = 'paid'
          
          UNION ALL
          
          SELECT wb.owner_id as customer_id, wb.id, wb.total_amount as amount
          FROM walk_in_bookings wb
          WHERE DATE(wb.created_at) BETWEEN ? AND ?
            AND wb.status = 'completed'
            AND wb.payment_status = 'paid'
        ) customer_visits ON u.id = customer_visits.customer_id
        WHERE u.role = 'pet_owner'
        GROUP BY u.id, u.name, u.email
        ORDER BY totalSpent DESC
        LIMIT ?
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate, limit]);
      
      return results.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        totalVisits: parseInt(row.totalVisits || 0),
        totalSpent: parseFloat(row.totalSpent || 0),
        averageSpent: parseFloat(row.averageSpent || 0)
      }));
      
    } catch (error) {
      console.error('Error in getTopCustomers:', error);
      throw error;
    }
  }
  
  /**
   * Get customer retention rate
   */
  async getCustomerRetention(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          COUNT(DISTINCT current_customers.customer_id) as currentCustomers,
          COUNT(DISTINCT returning_customers.customer_id) as returningCustomers
        FROM (
          SELECT DISTINCT customer_id FROM (
            SELECT a.owner_id as customer_id
            FROM appointments a
            WHERE DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
              AND a.status = 'completed'
            UNION
            SELECT wb.owner_id as customer_id
            FROM walk_in_bookings wb
            WHERE DATE(wb.created_at) BETWEEN ? AND ?
              AND wb.status = 'completed'
          ) as current_temp
        ) as current_customers
        LEFT JOIN (
          SELECT DISTINCT customer_id FROM (
            SELECT a.owner_id as customer_id
            FROM appointments a
            WHERE DATE(COALESCE(a.actual_date, a.preferred_date)) < ?
              AND a.status = 'completed'
            UNION
            SELECT wb.owner_id as customer_id
            FROM walk_in_bookings wb
            WHERE DATE(wb.created_at) < ?
              AND wb.status = 'completed'
          ) as previous_temp
        ) as returning_customers ON current_customers.customer_id = returning_customers.customer_id
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate, startDate, startDate]);
      
      const currentCustomers = parseInt(results[0]?.currentCustomers || 0);
      const returningCustomers = parseInt(results[0]?.returningCustomers || 0);
      
      const retentionRate = currentCustomers > 0 ? 
        ((returningCustomers / currentCustomers) * 100).toFixed(1) : 0;
      
      return {
        retentionRate: parseFloat(retentionRate)
      };
      
    } catch (error) {
      console.error('Error in getCustomerRetention:', error);
      throw error;
    }
  }
  
  /**
   * Get staff performance data
   */
  async getStaffPerformance(dateFilters) {
    try {
      const { startDate, endDate } = dateFilters;
      
      const query = `
        SELECT 
          u.id,
          u.name,
          u.staff_type as role,
          COUNT(staff_work.id) as servicesCompleted,
          COALESCE(SUM(staff_work.amount), 0) as revenueGenerated,
          COALESCE(AVG(staff_work.rating), 0) as averageRating,
          
          -- Calculate efficiency based on completed vs total assigned services
          (COUNT(CASE WHEN staff_work.status = 'completed' THEN 1 END) * 100.0 / 
           NULLIF(COUNT(staff_work.id), 0)) as efficiency
          
        FROM users u
        LEFT JOIN (
          SELECT a.groomer_id, a.id, a.total_amount as amount, a.status, r.rating
          FROM appointments a
          LEFT JOIN ratings r ON a.id = r.appointment_id
          WHERE DATE(COALESCE(a.actual_date, a.preferred_date)) BETWEEN ? AND ?
          
          UNION ALL
          
          SELECT wb.groomer_id, wb.id, wb.total_amount as amount, wb.status, wr.rating
          FROM walk_in_bookings wb
          LEFT JOIN walk_in_ratings wr ON wb.id = wr.walk_in_booking_id
          WHERE DATE(wb.created_at) BETWEEN ? AND ?
        ) staff_work ON u.id = staff_work.groomer_id
        
        WHERE u.role = 'staff'
          AND u.status = 'Active'
          AND (u.staff_type = 'Groomer' OR u.staff_type = 'Receptionist')
        
        GROUP BY u.id, u.name, u.staff_type
        ORDER BY revenueGenerated DESC
      `;
      
      const [results] = await db.query(query, [startDate, endDate, startDate, endDate]);
      
      return results.map(row => ({
        id: row.id,
        name: row.name,
        role: row.role || 'Staff',
        servicesCompleted: parseInt(row.servicesCompleted || 0),
        revenueGenerated: parseFloat(row.revenueGenerated || 0),
        averageRating: parseFloat(row.averageRating || 0).toFixed(1),
        efficiency: parseFloat(row.efficiency || 0).toFixed(1)
      }));
      
    } catch (error) {
      console.error('Error in getStaffPerformance:', error);
      throw error;
    }
  }
}

module.exports = new ReportsModel();