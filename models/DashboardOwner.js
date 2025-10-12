// models/DashboardOwner.js
const db = require('./db');

class DashboardModel {
 
    static  async getUserName(userId) {
    try {
      const query = 'SELECT name FROM users WHERE id = ?';
      const [rows] = await db.query(query, [userId]);
      
      if (rows && rows.length > 0) {
        return rows[0].name;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user name:', error);
      throw error;
    }
  }
  /**
   * Get recent activities (combined appointments, walk-ins, and other activities)
   */
  static async getRecentActivities(limit = 5) {
    try {
      const query = `
        SELECT 
          activity_data.id,
          activity_data.activity_type,
          activity_data.customer_name,
          activity_data.pet_name,
          activity_data.service_name,
          activity_data.total_amount,
          activity_data.status,
          activity_data.created_at,
          activity_data.groomer_name,
          pet.photo_url as pet_photo
        FROM (
          -- Appointments
          SELECT 
            a.id,
            'appointment' as activity_type,
            u.name as customer_name,
            pet.name as pet_name,
            gs.name as service_name,
            a.total_amount,
            a.status,
            a.created_at,
            a.pet_id,
            groomer.name as groomer_name
          FROM appointments a
          JOIN users u ON a.owner_id = u.id
          JOIN pets pet ON a.pet_id = pet.id
          JOIN grooming_services gs ON a.service_id = gs.id
          LEFT JOIN users groomer ON a.groomer_id = groomer.id
          WHERE a.status NOT IN ('cancelled')
          
          UNION ALL
          
          -- Walk-ins
          SELECT 
            w.id,
            'walk_in' as activity_type,
            u.name as customer_name,
            pet.name as pet_name,
            gs.name as service_name,
            w.total_amount,
            w.status,
            w.created_at,
            w.pet_id,
            groomer.name as groomer_name
          FROM walk_in_bookings w
          JOIN users u ON w.owner_id = u.id
          JOIN pets pet ON w.pet_id = pet.id
          JOIN grooming_services gs ON w.service_id = gs.id
          LEFT JOIN users groomer ON w.groomer_id = groomer.id
          WHERE w.status NOT IN ('cancelled')
          
          UNION ALL
          
          -- New customer registrations
          SELECT 
            u.id,
            'new_customer' as activity_type,
            u.name as customer_name,
            'New Customer' as pet_name,
            'Registration' as service_name,
            0 as total_amount,
            'completed' as status,
            u.created_at,
            NULL as pet_id,
            NULL as groomer_name
          FROM users u
          WHERE u.role = 'pet_owner'
          AND u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        ) activity_data
        LEFT JOIN pets pet ON activity_data.pet_id = pet.id
        ORDER BY activity_data.created_at DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [limit]);
      return result;
    } catch (error) {
      console.error('Error getting recent activities:', error);
      throw error;
    }
  }

  /**
   * Get top performing groomers
   */
  static async getTopGroomers(limit = 5, days = 30) {
    try {
      const query = `
        SELECT 
          u.id,
          u.name as groomer_name,
          u.profile_photo_url,
          groomer_stats.total_bookings,
          groomer_stats.total_revenue,
          groomer_stats.avg_rating,
          groomer_stats.completed_services
        FROM users u
        INNER JOIN (
          SELECT 
            groomer_data.groomer_id,
            COUNT(*) as total_bookings,
            SUM(groomer_data.total_amount) as total_revenue,
            AVG(COALESCE(groomer_data.rating, 5)) as avg_rating,
            SUM(CASE WHEN groomer_data.status = 'completed' THEN 1 ELSE 0 END) as completed_services
          FROM (
            -- Appointment groomer data
            SELECT 
              a.groomer_id,
              a.total_amount,
              a.status,
              a.created_at,
              COALESCE(r.rating, 5) as rating
            FROM appointments a
            LEFT JOIN ratings r ON a.id = r.appointment_id
            WHERE a.groomer_id IS NOT NULL
            AND a.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND a.status NOT IN ('cancelled')
            
            UNION ALL
            
            -- Walk-in groomer data
            SELECT 
              w.groomer_id,
              w.total_amount,
              w.status,
              w.created_at,
              COALESCE(wr.rating, 5) as rating
            FROM walk_in_bookings w
            LEFT JOIN walk_in_ratings wr ON w.id = wr.walk_in_booking_id
            WHERE w.groomer_id IS NOT NULL
            AND w.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            AND w.status NOT IN ('cancelled')
          ) groomer_data
          GROUP BY groomer_data.groomer_id
        ) groomer_stats ON u.id = groomer_stats.groomer_id
        WHERE u.role = 'staff' 
        AND u.staff_type = 'Groomer'
        AND u.status = 'Active'
        ORDER BY groomer_stats.total_revenue DESC, groomer_stats.completed_services DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [days, days, limit]);
      return result.map(row => ({
        ...row,
        total_revenue: parseFloat(row.total_revenue || 0),
        avg_rating: parseFloat(row.avg_rating || 5),
        total_bookings: parseInt(row.total_bookings || 0),
        completed_services: parseInt(row.completed_services || 0)
      }));
    } catch (error) {
      console.error('Error getting top groomers:', error);
      throw error;
    }
  }
  /**
   * Get current month revenue from both appointments and walk-ins
   */
  static async getCurrentMonthRevenue() {
    try {
      // Get appointments revenue
      const appointmentsQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM appointments 
        WHERE YEAR(preferred_date) = YEAR(CURDATE()) 
        AND MONTH(preferred_date) = MONTH(CURDATE())
        AND status = 'completed'
        AND payment_status = 'paid'
      `;

      // Get walk-ins revenue
      const walkInsQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM walk_in_bookings 
        WHERE YEAR(created_at) = YEAR(CURDATE()) 
        AND MONTH(created_at) = MONTH(CURDATE())
        AND status = 'completed'
        AND payment_status = 'paid'
      `;
      
      const [appointmentsResult] = await db.query(appointmentsQuery);
      const [walkInsResult] = await db.query(walkInsQuery);
      
      const appointmentsRevenue = parseFloat(appointmentsResult[0]?.revenue || 0);
      const walkInsRevenue = parseFloat(walkInsResult[0]?.revenue || 0);
      
      console.log('Current Month - Appointments Revenue:', appointmentsRevenue);
      console.log('Current Month - Walk-ins Revenue:', walkInsRevenue);
      console.log('Current Month - Total Revenue:', appointmentsRevenue + walkInsRevenue);
      
      return appointmentsRevenue + walkInsRevenue;
    } catch (error) {
      console.error('Error getting current month revenue:', error);
      throw error;
    }
  }

  /**
   * Get last month revenue
   */
 static async getLastMonthRevenue() {
    try {
      // Get appointments revenue for last month
      const appointmentsQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM appointments 
        WHERE YEAR(preferred_date) = YEAR(CURDATE() - INTERVAL 1 MONTH) 
        AND MONTH(preferred_date) = MONTH(CURDATE() - INTERVAL 1 MONTH)
        AND status = 'completed'
        AND payment_status = 'paid'
      `;

      // Get walk-ins revenue for last month
      const walkInsQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM walk_in_bookings 
        WHERE YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) 
        AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)
        AND status = 'completed'
        AND payment_status = 'paid'
      `;
      
      const [appointmentsResult] = await db.query(appointmentsQuery);
      const [walkInsResult] = await db.query(walkInsQuery);
      
      const appointmentsRevenue = parseFloat(appointmentsResult[0]?.revenue || 0);
      const walkInsRevenue = parseFloat(walkInsResult[0]?.revenue || 0);
      
      console.log('Last Month - Appointments Revenue:', appointmentsRevenue);
      console.log('Last Month - Walk-ins Revenue:', walkInsRevenue);
      console.log('Last Month - Total Revenue:', appointmentsRevenue + walkInsRevenue);
      
      return appointmentsRevenue + walkInsRevenue;
    } catch (error) {
      console.error('Error getting last month revenue:', error);
      throw error;
    }
  }

  /**
   * Get total appointments count
   */
 static async getTotalAppointments() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM appointments 
        WHERE status NOT IN ('cancelled')
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting total appointments:', error);
      throw error;
    }
  }

  /**
   * Get pending appointments count
   */
  static async getPendingAppointments() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM appointments 
        WHERE status IN ('pending', 'confirmed')
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting pending appointments:', error);
      throw error;
    }
  }

  /**
   * Get total walk-ins count
   */
 static async getTotalWalkIns() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM walk_in_bookings 
        WHERE status NOT IN ('cancelled')
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting total walk-ins:', error);
      throw error;
    }
  }

  /**
   * Get today's walk-ins count
   */
 static async getTodayWalkIns() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM walk_in_bookings 
        WHERE DATE(created_at) = CURDATE()
        AND status NOT IN ('cancelled')
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting today walk-ins:', error);
      throw error;
    }
  }

  /**
   * Get total customers count
   */
  static async getTotalCustomers() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM users 
        WHERE role = 'pet_owner'
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting total customers:', error);
      throw error;
    }
  }

  /**
   * Get new customers this month
   */
  static async getNewCustomersThisMonth() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM users 
        WHERE role = 'pet_owner'
        AND YEAR(created_at) = YEAR(CURDATE()) 
        AND MONTH(created_at) = MONTH(CURDATE())
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting new customers this month:', error);
      throw error;
    }
  }

  /**
   * Get popular services from actual bookings
   */
  static async getPopularServices(limit = 5) {
    try {
      const query = `
        SELECT 
          gs.id,
          gs.name,
          service_counts.bookings,
          ROUND((service_counts.bookings * 100.0 / NULLIF(total_bookings.total, 0)), 1) as percentage
        FROM grooming_services gs
        LEFT JOIN (
          SELECT service_id, COUNT(*) as bookings
          FROM (
            SELECT service_id FROM appointments WHERE status = 'completed'
            UNION ALL
            SELECT service_id FROM walk_in_bookings WHERE status = 'completed'
          ) all_services
          GROUP BY service_id
        ) service_counts ON gs.id = service_counts.service_id
        CROSS JOIN (
          SELECT COUNT(*) as total
          FROM (
            SELECT id FROM appointments WHERE status = 'completed'
            UNION ALL
            SELECT id FROM walk_in_bookings WHERE status = 'completed'
          ) all_bookings
        ) total_bookings
        ORDER BY service_counts.bookings DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [limit]);
      return result.map(row => ({
        ...row,
        bookings: row.bookings || 0,
        percentage: row.percentage || 0
      }));
    } catch (error) {
      console.error('Error getting popular services:', error);
      throw error;
    }
  }
/**
 * Get recent bookings from both appointments and walk-ins with pet photos
 */
static async getRecentBookings(limit = 10) {
    try {
      const query = `
        SELECT 
          booking_data.id,
          booking_data.customer_name,
          booking_data.pet_name,
          booking_data.service_name,
          booking_data.total_amount,
          booking_data.status,
          booking_data.created_at,
          booking_data.booking_type,
          pet.photo_url as pet_photo
        FROM (
          SELECT 
            a.id,
            u.name as customer_name,
            pet.name as pet_name,
            gs.name as service_name,
            a.total_amount,
            a.status,
            a.created_at,
            a.pet_id,
            'appointment' as booking_type
          FROM appointments a
          JOIN users u ON a.owner_id = u.id
          JOIN pets pet ON a.pet_id = pet.id
          JOIN grooming_services gs ON a.service_id = gs.id
          WHERE a.status NOT IN ('cancelled')
          
          UNION ALL
          
          SELECT 
            w.id,
            u.name as customer_name,
            pet.name as pet_name,
            gs.name as service_name,
            w.total_amount,
            w.status,
            w.created_at,
            w.pet_id,
            'walk_in' as booking_type
          FROM walk_in_bookings w
          JOIN users u ON w.owner_id = u.id
          JOIN pets pet ON w.pet_id = pet.id
          JOIN grooming_services gs ON w.service_id = gs.id
          WHERE w.status NOT IN ('cancelled')
        ) booking_data
        JOIN pets pet ON booking_data.pet_id = pet.id
        ORDER BY booking_data.created_at DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [limit]);
      return result;
    } catch (error) {
      console.error('Error getting recent bookings:', error);
      throw error;
    }
  }
  /**
 * Get recent appointments only
 */
static async getRecentAppointments(limit = 5) {
    try {
      const query = `
        SELECT 
          a.id,
          u.name as customer_name,
          pet.name as pet_name,
          GROUP_CONCAT(DISTINCT gs.name ORDER BY gs.name SEPARATOR ', ') as service_names,
          a.total_amount,
          a.status,
          a.created_at,
          pet.photo_url as pet_photo
        FROM appointments a
        JOIN users u ON a.owner_id = u.id
        JOIN pets pet ON a.pet_id = pet.id
        LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
        LEFT JOIN grooming_services gs ON aps.service_id = gs.id OR a.service_id = gs.id
        WHERE a.status NOT IN ('cancelled')
        GROUP BY a.id, u.name, pet.name, a.total_amount, a.status, a.created_at, pet.photo_url
        ORDER BY a.created_at DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [limit]);
      
      // If no addon services found, fall back to main service
      const processedResult = result.map(row => ({
        ...row,
        service_name: row.service_names || 'Unknown Service',
        booking_type: 'appointment'
      }));
      
      return processedResult;
    } catch (error) {
      console.error('Error getting recent appointments:', error);
      throw error;
    }
  }
  
  /**
   * Get recent walk-ins only
   */
 static async getRecentWalkIns(limit = 5) {
    try {
      const query = `
        SELECT 
          w.id,
          u.name as customer_name,
          pet.name as pet_name,
          GROUP_CONCAT(DISTINCT gs.name ORDER BY gs.name SEPARATOR ', ') as service_names,
          w.total_amount,
          w.status,
          w.created_at,
          pet.photo_url as pet_photo
        FROM walk_in_bookings w
        JOIN users u ON w.owner_id = u.id
        JOIN pets pet ON w.pet_id = pet.id
        LEFT JOIN walk_in_booking_services wbs ON w.id = wbs.walk_in_booking_id
        LEFT JOIN grooming_services gs ON wbs.service_id = gs.id OR w.service_id = gs.id
        WHERE w.status NOT IN ('cancelled')
        GROUP BY w.id, u.name, pet.name, w.total_amount, w.status, w.created_at, pet.photo_url
        ORDER BY w.created_at DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [limit]);
      
      // If no addon services found, fall back to main service
      const processedResult = result.map(row => ({
        ...row,
        service_name: row.service_names || 'Unknown Service',
        booking_type: 'walk_in'
      }));
      
      return processedResult;
    } catch (error) {
      console.error('Error getting recent walk-ins:', error);
      throw error;
    }
  }

 /**
 * Get revenue chart data from actual bookings (with debugging)
 */
 static async getRevenueChartData(days = 30) {
    try {
      console.log(`=== GETTING REVENUE CHART DATA FOR ${days} DAYS ===`);
      
      // Get appointments revenue by date
      const appointmentsQuery = `
        SELECT 
          DATE(preferred_date) as chart_date,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM appointments
        WHERE preferred_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND status = 'completed'
        AND payment_status = 'paid'
        GROUP BY DATE(preferred_date)
        ORDER BY chart_date ASC
      `;
  
      // Get walk-ins revenue by date
      const walkInsQuery = `
        SELECT 
          DATE(created_at) as chart_date,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM walk_in_bookings
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND status = 'completed'
        AND payment_status = 'paid'
        GROUP BY DATE(created_at)
        ORDER BY chart_date ASC
      `;
      
      console.log('Executing appointment query:', appointmentsQuery);
      console.log('Executing walk-in query:', walkInsQuery);
      console.log('Days parameter:', days);
      
      const [appointmentsData] = await db.query(appointmentsQuery, [days]);
      const [walkInsData] = await db.query(walkInsQuery, [days]);
      
      console.log('Raw appointments data:', appointmentsData);
      console.log('Raw walk-ins data:', walkInsData);
      
      // Combine the data by date
      const combinedData = {};
      
      // Add appointments data
      appointmentsData.forEach(item => {
        const dateStr = item.chart_date.toISOString().split('T')[0];
        combinedData[dateStr] = (combinedData[dateStr] || 0) + parseFloat(item.revenue);
        console.log(`Added appointment revenue: ${dateStr} = ${item.revenue}`);
      });
      
      // Add walk-ins data
      walkInsData.forEach(item => {
        const dateStr = item.chart_date.toISOString().split('T')[0];
        combinedData[dateStr] = (combinedData[dateStr] || 0) + parseFloat(item.revenue);
        console.log(`Added walk-in revenue: ${dateStr} = ${item.revenue}`);
      });
      
      console.log('Combined data object:', combinedData);
      
      // Convert to array format
      const result = Object.keys(combinedData).map(date => ({
        date: date,
        revenue: combinedData[date]
      })).sort((a, b) => new Date(a.date) - new Date(b.date));
      
      console.log('Result before filling dates:', result);
      
      // Fill in missing dates with 0 revenue
      const filledData = DashboardModel.fillMissingDates(result, days);
      console.log('Final filled data:', filledData);
      console.log('Final data length:', filledData.length);
      
      return filledData;
    } catch (error) {
      console.error('❌ Error getting revenue chart data:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Get today's revenue
   */
 static async getTodayRevenue() {
    try {
      const query = `
        SELECT COALESCE(SUM(total_revenue), 0) as revenue
        FROM (
          SELECT total_amount as total_revenue
          FROM appointments
          WHERE DATE(preferred_date) = CURDATE()
          AND status = 'completed'
          AND payment_status = 'paid'
          
          UNION ALL
          
          SELECT total_amount as total_revenue
          FROM walk_in_bookings
          WHERE DATE(created_at) = CURDATE()
          AND status = 'completed'
          AND payment_status = 'paid'
        ) combined_revenue
      `;
      
      const [result] = await db.query(query);
      return parseFloat(result[0]?.revenue || 0);
    } catch (error) {
      console.error('Error getting today revenue:', error);
      throw error;
    }
  }

  /**
   * Get active appointments
   */
 static async getActiveAppointments() {
    try {
      const query = `
        SELECT 
          a.id,
          a.queue_number,
          u.name as customer_name,
          p.name as pet_name,
          gs.name as service_name,
          a.status,
          groomer.name as groomer_name
        FROM appointments a
        JOIN users u ON a.owner_id = u.id
        JOIN pets p ON a.pet_id = p.id
        JOIN grooming_services gs ON a.service_id = gs.id
        LEFT JOIN users groomer ON a.groomer_id = groomer.id
        WHERE a.status IN ('confirmed', 'in_progress')
        AND DATE(a.preferred_date) = CURDATE()
        ORDER BY a.queue_number ASC
      `;
      
      const [result] = await db.query(query);
      return result;
    } catch (error) {
      console.error('Error getting active appointments:', error);
      throw error;
    }
  }

  /**
   * Get waiting customers count
   */
  static async getWaitingCustomers() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM (
          SELECT id FROM appointments 
          WHERE status = 'confirmed' 
          AND DATE(preferred_date) = CURDATE()
          UNION ALL
          SELECT id FROM walk_in_bookings 
          WHERE status = 'pending'
          AND DATE(created_at) = CURDATE()
        ) waiting
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting waiting customers:', error);
      throw error;
    }
  }

  /**
   * Get available groomers count
   */
 static async getAvailableGroomers() {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM users 
        WHERE role = 'staff' 
        AND staff_type = 'Groomer'
        AND status = 'Active'
        AND id NOT IN (
          SELECT DISTINCT groomer_id 
          FROM appointments 
          WHERE status = 'in_progress'
          AND groomer_id IS NOT NULL
        )
      `;
      
      const [result] = await db.query(query);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting available groomers:', error);
      throw error;
    }
  }

  /**
   * Fill missing dates in chart data with zero values
   */
  static fillMissingDates(data, days) {
    const filledData = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];
      
      const existingData = data.find(item => 
        new Date(item.date).toISOString().split('T')[0] === dateString
      );
      
      filledData.push({
        date: dateString,
        revenue: existingData ? existingData.revenue : 0
      });
    }
    
    return filledData;
  }

  // Additional methods for compatibility...
  static async getMonthlyRevenue(year, month) {
    try {
      const query = `
        SELECT COALESCE(SUM(total_revenue), 0) as revenue
        FROM (
          SELECT total_amount as total_revenue
          FROM appointments 
          WHERE YEAR(preferred_date) = ? 
          AND MONTH(preferred_date) = ?
          AND status = 'completed'
          AND payment_status = 'paid'
          
          UNION ALL
          
          SELECT total_amount as total_revenue
          FROM walk_in_bookings 
          WHERE YEAR(created_at) = ? 
          AND MONTH(created_at) = ?
          AND status = 'completed'
          AND payment_status = 'paid'
        ) combined_revenue
      `;
      
      const [result] = await db.query(query, [year, month, year, month]);
      return parseFloat(result[0]?.revenue || 0);
    } catch (error) {
      console.error('Error getting monthly revenue:', error);
      throw error;
    }
  }

  static async getMonthlyAppointments(year, month) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM appointments 
        WHERE YEAR(preferred_date) = ? 
        AND MONTH(preferred_date) = ?
        AND status NOT IN ('cancelled')
      `;
      
      const [result] = await db.query(query, [year, month]);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting monthly appointments:', error);
      throw error;
    }
  }

 static async getMonthlyWalkIns(year, month) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM walk_in_bookings 
        WHERE YEAR(created_at) = ? 
        AND MONTH(created_at) = ?
        AND status NOT IN ('cancelled')
      `;
      
      const [result] = await db.query(query, [year, month]);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting monthly walk-ins:', error);
      throw error;
    }
  }

  static async getMonthlyNewCustomers(year, month) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM users 
        WHERE role = 'pet_owner'
        AND YEAR(created_at) = ? 
        AND MONTH(created_at) = ?
      `;
      
      const [result] = await db.query(query, [year, month]);
      return parseInt(result[0]?.count || 0);
    } catch (error) {
      console.error('Error getting monthly new customers:', error);
      throw error;
    }
  }

 static async getTopServicesForMonth(year, month, limit = 5) {
    try {
      const query = `
        SELECT 
          gs.name,
          service_counts.bookings,
          service_counts.revenue
        FROM grooming_services gs
        INNER JOIN (
          SELECT 
            service_id,
            COUNT(*) as bookings,
            SUM(total_amount) as revenue
          FROM (
            SELECT service_id, total_amount
            FROM appointments 
            WHERE YEAR(preferred_date) = ? 
            AND MONTH(preferred_date) = ?
            AND status = 'completed'
            
            UNION ALL
            
            SELECT service_id, total_amount
            FROM walk_in_bookings 
            WHERE YEAR(created_at) = ? 
            AND MONTH(created_at) = ?
            AND status = 'completed'
          ) monthly_services
          GROUP BY service_id
        ) service_counts ON gs.id = service_counts.service_id
        ORDER BY service_counts.bookings DESC
        LIMIT ?
      `;
      
      const [result] = await db.query(query, [year, month, year, month, limit]);
      return result;
    } catch (error) {
      console.error('Error getting top services for month:', error);
      throw error;
    }
  }
  // Add this method to your DashboardModel class

/**
 * Get total revenue from all completed transactions
 */
static async getTotalRevenue() {
    try {
      // Get all-time appointments revenue
      const appointmentsQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM appointments 
        WHERE status = 'completed'
        AND payment_status = 'paid'
      `;
  
      // Get all-time walk-ins revenue
      const walkInsQuery = `
        SELECT COALESCE(SUM(total_amount), 0) as revenue
        FROM walk_in_bookings 
        WHERE status = 'completed'
        AND payment_status = 'paid'
      `;
      
      const [appointmentsResult] = await db.query(appointmentsQuery);
      const [walkInsResult] = await db.query(walkInsQuery);
      
      const appointmentsRevenue = parseFloat(appointmentsResult[0]?.revenue || 0);
      const walkInsRevenue = parseFloat(walkInsResult[0]?.revenue || 0);
      
      console.log('Total - Appointments Revenue:', appointmentsRevenue);
      console.log('Total - Walk-ins Revenue:', walkInsRevenue);
      console.log('Total - All-Time Revenue:', appointmentsRevenue + walkInsRevenue);
      
      return appointmentsRevenue + walkInsRevenue;
    } catch (error) {
      console.error('Error getting total revenue:', error);
      throw error;
    }
  }
}

module.exports = DashboardModel;