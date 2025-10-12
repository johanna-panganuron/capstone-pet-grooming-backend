// models/Dashboard.js
const db = require('./db');

class Dashboard {
  static async getUserStats(userId) {
    try {
      // Get user's pets count
      const [petsResult] = await db.query(
        'SELECT COUNT(*) as pet_count FROM pets WHERE user_id = ?',
        [userId]
      );

      // Get user's appointments count and total spent from COMPLETED appointments only
      const [appointmentsResult] = await db.query(
        'SELECT COUNT(*) as appointment_count, COALESCE(SUM(CASE WHEN status = "completed" THEN total_amount ELSE 0 END), 0) as appointments_total FROM appointments WHERE owner_id = ?',
        [userId]
      );

      // Get user's walk-ins count and total spent from COMPLETED walk-ins only
      const [walkInsResult] = await db.query(
        'SELECT COUNT(*) as walk_in_count, COALESCE(SUM(CASE WHEN status = "completed" THEN total_amount ELSE 0 END), 0) as walk_ins_total FROM walk_in_bookings WHERE owner_id = ?',
        [userId]
      );

      // Get pending walk-ins count
      const [pendingWalkInsResult] = await db.query(
        'SELECT COUNT(*) as pending_walk_ins_count FROM walk_in_bookings WHERE owner_id = ? AND status = "pending"',
        [userId]
      );

      // Get user's recent walk-ins (last 5)
      const [recentWalkIns] = await db.query(`
      SELECT 
        w.id,
        w.time_slot,
        w.status,
        w.total_amount,
        DATE(w.created_at) as display_date,
        w.time_slot as display_time,
        w.created_at,
        p.name as pet_name,
        GROUP_CONCAT(gs.name ORDER BY gs.name SEPARATOR ', ') as service_name,
        ses.start_time as session_start,
        ses.end_time as session_end,
        ses.duration_minutes,
        ses.status as session_status
      FROM walk_in_bookings w
      JOIN pets p ON w.pet_id = p.id
      LEFT JOIN walk_in_booking_services wbs ON w.id = wbs.walk_in_booking_id
      LEFT JOIN grooming_services gs ON wbs.service_id = gs.id
      LEFT JOIN grooming_sessions ses ON w.id = ses.walk_in_booking_id
      WHERE w.owner_id = ?
      GROUP BY w.id, w.time_slot, w.status, w.total_amount, w.created_at, p.name, ses.start_time, ses.end_time, ses.duration_minutes, ses.status
      ORDER BY w.created_at DESC
      LIMIT 5
    `, [userId]);

      // Get user's recent appointments (last 5)
      const [recentAppointments] = await db.query(`
      SELECT 
        a.id,
        COALESCE(a.actual_date, a.preferred_date) as display_date,
        COALESCE(a.actual_time, a.preferred_time) as display_time,
        a.status,
        a.total_amount,
        p.name as pet_name,
        CONCAT(
          gs_main.name,
          CASE 
            WHEN GROUP_CONCAT(gs_addon.name ORDER BY gs_addon.name SEPARATOR ', ') IS NOT NULL 
            THEN CONCAT(', ', GROUP_CONCAT(gs_addon.name ORDER BY gs_addon.name SEPARATOR ', '))
            ELSE ''
          END
        ) as service_name,
        ses.start_time as session_start,
        ses.end_time as session_end,
        ses.duration_minutes,
        ses.status as session_status
      FROM appointments a
      JOIN pets p ON a.pet_id = p.id
      JOIN grooming_services gs_main ON a.service_id = gs_main.id
      LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
      LEFT JOIN grooming_services gs_addon ON aps.service_id = gs_addon.id
      LEFT JOIN appointment_sessions ses ON a.id = ses.appointment_id
      WHERE a.owner_id = ?
      GROUP BY a.id, a.preferred_date, a.preferred_time, a.actual_date, a.actual_time, a.status, a.total_amount, p.name, gs_main.name, ses.start_time, ses.end_time, ses.duration_minutes, ses.status
      ORDER BY a.created_at DESC
      LIMIT 5
    `, [userId]);

      // Get user's upcoming appointments
      const [upcomingAppointments] = await db.query(`
        SELECT COUNT(*) as upcoming_appointments_count
        FROM appointments a
        WHERE a.owner_id = ? AND a.preferred_date >= CURDATE() AND a.status IN ('pending', 'confirmed')
      `, [userId]);

      // Get user's pets with their last grooming date
const [userPets] = await db.query(`
SELECT 
  p.*,
  CASE 
    WHEN MAX(a.actual_date) IS NOT NULL OR MAX(w.created_at) IS NOT NULL
    THEN GREATEST(
      COALESCE(MAX(a.actual_date), '1900-01-01'),
      COALESCE(MAX(w.created_at), '1900-01-01')
    )
    ELSE NULL
  END as last_grooming_date
FROM pets p
LEFT JOIN appointments a ON p.id = a.pet_id AND a.status = 'completed'
LEFT JOIN walk_in_bookings w ON p.id = w.pet_id AND w.status = 'completed'
WHERE p.user_id = ?
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 5
`, [userId]);

      // Calculate total spent
      const appointmentsTotal = parseFloat(appointmentsResult[0].appointments_total) || 0;
      const walkInsTotal = parseFloat(walkInsResult[0].walk_ins_total) || 0;
      const totalSpent = (appointmentsTotal + walkInsTotal).toFixed(2);

      return {
        pet_count: petsResult[0].pet_count || 0,
        appointment_count: appointmentsResult[0].appointment_count || 0,
        walk_in_count: walkInsResult[0].walk_in_count || 0,
        pending_walk_ins_count: pendingWalkInsResult[0].pending_walk_ins_count || 0,
        upcoming_appointments_count: upcomingAppointments[0].upcoming_appointments_count || 0,
        total_spent: totalSpent,
        recent_appointments: recentAppointments || [],
        recent_walk_ins: recentWalkIns || [],
        user_pets: userPets || []
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

}

module.exports = Dashboard;