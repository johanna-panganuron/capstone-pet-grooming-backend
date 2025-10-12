// models/DashboardStaff.js
const db = require('./db');

class DashboardStaff {
    // Add this method to your DashboardStaff model (models/DashboardStaff.js)

// Get user profile
// models/DashboardStaff.js

static async getUserProfile(userId) {
  try {
    console.log(`Fetching user profile for ID: ${userId}`);

    const query = `
      SELECT 
        id,
        name,
        email,
        role,
        staff_type,
        status,
        profile_photo_url,
        created_at
      FROM users 
      WHERE id = ? AND status = 'Active'
    `;

    // Use db.execute with array destructuring (same as your other methods)
    const [results] = await db.execute(query, [userId]);
    
    if (results.length === 0) {
      throw new Error('User not found or inactive');
    }

    const user = results[0];
    
    console.log(`User profile fetched for: ${user.name}`);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      staff_type: user.staff_type,
      status: user.status,
      profile_photo_url: user.profile_photo_url,
      created_at: user.created_at
    };

  } catch (error) {
    console.error('Error in getUserProfile:', error);
    throw error;
  }
}
    // Get dashboard statistics
    static async getDashboardStats() {
      try {
        console.log('Fetching dashboard stats...');
  
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
        // Today's appointments count
        const [todayAppointmentsResult] = await db.execute(`
          SELECT COUNT(*) as count
          FROM appointments 
          WHERE DATE(preferred_date) = ? 
          AND status NOT IN ('cancelled')
        `, [today]);
  
        // Yesterday's appointments count for trend
        const [yesterdayAppointmentsResult] = await db.execute(`
          SELECT COUNT(*) as count
          FROM appointments 
          WHERE DATE(preferred_date) = ? 
          AND status NOT IN ('cancelled')
        `, [yesterday]);
  
        // Today's walk-ins count
        const [todayWalkInsResult] = await db.execute(`
          SELECT COUNT(*) as count
          FROM walk_in_bookings 
          WHERE DATE(created_at) = ? 
          AND status NOT IN ('cancelled')
        `, [today]);
  
        // Yesterday's walk-ins count for trend
        const [yesterdayWalkInsResult] = await db.execute(`
          SELECT COUNT(*) as count
          FROM walk_in_bookings 
          WHERE DATE(created_at) = ? 
          AND status NOT IN ('cancelled')
        `, [yesterday]);
  
        // Pending appointments count
        const [pendingAppointmentsResult] = await db.execute(`
          SELECT COUNT(*) as count
          FROM appointments 
          WHERE status = 'pending'
        `);
  
        // Today's revenue
        const [todayRevenueResult] = await db.execute(`
          SELECT 
            COALESCE(SUM(a.total_amount), 0) as appointment_revenue,
            COALESCE(
              (SELECT SUM(w.total_amount) 
               FROM walk_in_bookings w 
               WHERE DATE(w.created_at) = ? 
               AND w.status = 'completed' 
               AND w.payment_status = 'paid'), 0
            ) as walkin_revenue
          FROM appointments a
          WHERE DATE(a.preferred_date) = ? 
          AND a.status = 'completed' 
          AND a.payment_status = 'paid'
        `, [today, today]);
  
        // Yesterday's revenue for trend
        const [yesterdayRevenueResult] = await db.execute(`
          SELECT 
            COALESCE(SUM(a.total_amount), 0) as appointment_revenue,
            COALESCE(
              (SELECT SUM(w.total_amount) 
               FROM walk_in_bookings w 
               WHERE DATE(w.created_at) = ? 
               AND w.status = 'completed' 
               AND w.payment_status = 'paid'), 0
            ) as walkin_revenue
          FROM appointments a
          WHERE DATE(a.preferred_date) = ? 
          AND a.status = 'completed' 
          AND a.payment_status = 'paid'
        `, [yesterday, yesterday]);
  
        // Calculate statistics
        const todayAppointments = todayAppointmentsResult[0]?.count || 0;
        const yesterdayAppointments = yesterdayAppointmentsResult[0]?.count || 0;
        const todayWalkIns = todayWalkInsResult[0]?.count || 0;
        const yesterdayWalkIns = yesterdayWalkInsResult[0]?.count || 0;
        const pendingAppointments = pendingAppointmentsResult[0]?.count || 0;
  
        const todayRevenue = parseFloat(todayRevenueResult[0]?.appointment_revenue || 0) + 
                            parseFloat(todayRevenueResult[0]?.walkin_revenue || 0);
        const yesterdayRevenue = parseFloat(yesterdayRevenueResult[0]?.appointment_revenue || 0) + 
                                parseFloat(yesterdayRevenueResult[0]?.walkin_revenue || 0);
  
        // Calculate trends (percentage change)
        const appointmentsTrend = yesterdayAppointments > 0 
          ? Math.round(((todayAppointments - yesterdayAppointments) / yesterdayAppointments) * 100)
          : (todayAppointments > 0 ? 100 : 0);
  
        const walkInsTrend = yesterdayWalkIns > 0 
          ? Math.round(((todayWalkIns - yesterdayWalkIns) / yesterdayWalkIns) * 100)
          : (todayWalkIns > 0 ? 100 : 0);
  
        const revenueTrend = yesterdayRevenue > 0 
          ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
          : (todayRevenue > 0 ? 100 : 0);
  
        const stats = {
          todayAppointments,
          todayWalkIns,
          pendingAppointments,
          todayRevenue,
          appointmentsTrend,
          walkInsTrend,
          revenueTrend
        };
  
        console.log('Dashboard stats calculated:', stats);
        return stats;
  
      } catch (error) {
        console.error('Error in getDashboardStats:', error);
        throw error;
      }
    }
  
    // Get today's schedule
   // Update the getTodaySchedule method in your DashboardStaff model
static async getTodaySchedule(filter = 'all') {
    try {
      console.log(`Fetching today's schedule with filter: ${filter}`);
  
      const today = new Date().toISOString().split('T')[0];
      
      let whereClause = `WHERE DATE(a.preferred_date) = ?`;
      let params = [today];
  
      if (filter && filter !== 'all') {
        whereClause += ` AND a.status = ?`;
        params.push(filter);
      }
  
      const query = `
        SELECT 
          a.id,
          a.preferred_time,
          a.status,
          a.total_amount,
          u.name as customer_name,
          p.name as pet_name,
          a.queue_number,
          a.special_notes,
          -- Get services from both old structure (direct service_id) and new structure (appointment_services)
          COALESCE(
            GROUP_CONCAT(
              DISTINCT gs_multi.name 
              ORDER BY gs_multi.name ASC 
              SEPARATOR ', '
            ),
            gs_single.name
          ) as service_names
        FROM appointments a
        JOIN users u ON a.owner_id = u.id
        JOIN pets p ON a.pet_id = p.id
        -- For old structure: direct service_id in appointments table
        LEFT JOIN grooming_services gs_single ON a.service_id = gs_single.id
        -- For new structure: multiple services via appointment_services table
        LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
        LEFT JOIN grooming_services gs_multi ON aps.service_id = gs_multi.id
        ${whereClause}
        GROUP BY a.id, a.preferred_time, a.status, a.total_amount, 
                 u.name, p.name, a.queue_number, a.special_notes, gs_single.name
        ORDER BY a.preferred_time ASC
        LIMIT 20
      `;
  
      const [results] = await db.execute(query, params);
      
      console.log(`Found ${results.length} appointments for today`);
      return results;
  
    } catch (error) {
      console.error('Error in getTodaySchedule:', error);
      throw error;
    }
  }
  
    // Get recent activities
    static async getRecentActivities() {
      try {
        console.log('Fetching recent activities...');
  
        const query = `
          (
            SELECT 
              'appointment' as type,
              CONCAT('New appointment booked by ', u.name, ' for ', p.name) as description,
              a.created_at
            FROM appointments a
            JOIN users u ON a.owner_id = u.id
            JOIN pets p ON a.pet_id = p.id
            WHERE a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY a.created_at DESC
            LIMIT 10
          )
          UNION ALL
          (
            SELECT 
              'walk_in' as type,
              CONCAT('Walk-in booking for ', u.name, ' with ', p.name) as description,
              w.created_at
            FROM walk_in_bookings w
            JOIN users u ON w.owner_id = u.id
            JOIN pets p ON w.pet_id = p.id
            WHERE w.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY w.created_at DESC
            LIMIT 10
          )
          UNION ALL
          (
            SELECT 
              'payment' as type,
              CONCAT('Payment received from ', u.name, ' - ₱', FORMAT(py.amount, 2)) as description,
              py.paid_at as created_at
            FROM payments py
            JOIN appointments a ON py.appointment_id = a.id
            JOIN users u ON py.user_id = u.id
            WHERE py.status = 'completed' 
            AND py.paid_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ORDER BY py.paid_at DESC
            LIMIT 10
          )
          ORDER BY created_at DESC
          LIMIT 15
        `;
  
        const [results] = await db.execute(query);
        
        // Add unique IDs for frontend rendering
        const activities = results.map((activity, index) => ({
          ...activity,
          id: `${activity.type}_${index}_${Date.now()}`
        }));
  
        console.log(`Found ${activities.length} recent activities`);
        return activities;
  
      } catch (error) {
        console.error('Error in getRecentActivities:', error);
        throw error;
      }
    }
  }
  
  module.exports = DashboardStaff;