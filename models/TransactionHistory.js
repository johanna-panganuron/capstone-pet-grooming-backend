// models/TransactionHistory.js

const db = require('./db');

class TransactionHistory {
  // Get all transactions with filters from existing tables
  static async findAll(filters = {}) {
    let appointmentQuery = `
    SELECT 
      a.id,
      'appointment' as transaction_type,
      a.id as appointment_id,
      NULL as walk_in_booking_id,
      a.owner_id as customer_id,
      u.name as customer_name,
      a.pet_id,
      p.name as pet_name,
      a.service_id,
      gs.name as service_name,
      a.base_price as base_amount,
      COALESCE(a.matted_coat_fee, 0) as matted_coat_fee,
      COALESCE(addon_services.total_addon_amount, 0) as addon_services_amount,
      a.total_amount,
      COALESCE(a.payment_method, 'cash') as payment_method,
      a.payment_status,
      a.groomer_id,
      groomer.name as groomer_name,
      a.status as transaction_status,
      COALESCE(a.actual_date, a.preferred_date) as service_date,
      -- FIX: Use COALESCE to get either queue_number or daily_queue_number
      COALESCE(a.queue_number, a.daily_queue_number) as queue_number,
      a.refund_status,
      a.created_at,
      a.updated_at,
      GROUP_CONCAT(
        CASE WHEN addon_gs.id IS NOT NULL AND addon_services_individual.service_id != a.service_id
        THEN CONCAT(addon_gs.name, ' (₱', addon_services_individual.price, ')') 
        END SEPARATOR ', '
      ) as addon_services_list
    FROM appointments a
    LEFT JOIN users u ON a.owner_id = u.id
    LEFT JOIN pets p ON a.pet_id = p.id
    LEFT JOIN grooming_services gs ON a.service_id = gs.id
    LEFT JOIN users groomer ON a.groomer_id = groomer.id
    LEFT JOIN (
      SELECT 
        appointment_id,
        SUM(price) as total_addon_amount
      FROM appointment_services 
      WHERE appointment_id IS NOT NULL
      GROUP BY appointment_id
    ) addon_services ON a.id = addon_services.appointment_id
    LEFT JOIN appointment_services addon_services_individual ON a.id = addon_services_individual.appointment_id
    LEFT JOIN grooming_services addon_gs ON addon_services_individual.service_id = addon_gs.id
    WHERE a.status IN ('completed', 'cancelled')
  `;
  
  let walkInQuery = `
  SELECT 
    w.id,
    'walk_in' as transaction_type,
    NULL as appointment_id,
    w.id as walk_in_booking_id,
    w.owner_id as customer_id,
    u.name as customer_name,
    w.pet_id,
    p.name as pet_name,
    w.service_id,
    GROUP_CONCAT(
      DISTINCT CASE WHEN wbs_all.is_addon = 0 
      THEN primary_gs.name 
      END SEPARATOR ', '
    ) as service_name,
    w.base_price as base_amount,
    COALESCE(w.matted_coat_fee, 0) as matted_coat_fee,
    COALESCE(addon_services.total_addon_amount, 0) as addon_services_amount,
    w.total_amount,
    COALESCE(
      GROUP_CONCAT(DISTINCT wip.payment_method ORDER BY wip.created_at SEPARATOR ', '),
      w.payment_method
    ) as payment_method,
    w.payment_status,
    w.groomer_id,
    groomer.name as groomer_name,
    w.status as transaction_status,
    DATE(w.created_at) as service_date,
    w.queue_number,
    CASE 
      WHEN w.status = 'cancelled' AND w.refund_eligible = 1 THEN 'refunded'
      WHEN w.status = 'cancelled' AND w.refund_eligible = 0 THEN 'not_refunded'
      ELSE NULL 
    END as refund_status,
    w.created_at,
    w.updated_at,
    GROUP_CONCAT(
      DISTINCT CASE WHEN wbs_all.is_addon = 1 
      THEN CONCAT(addon_gs.name, ' (₱', wbs_all.price, ')') 
      END SEPARATOR ', '
    ) as addon_services_list
  FROM walk_in_bookings w
  LEFT JOIN users u ON w.owner_id = u.id
  LEFT JOIN pets p ON w.pet_id = p.id
  LEFT JOIN users groomer ON w.groomer_id = groomer.id
  LEFT JOIN walk_in_booking_payments wip ON w.id = wip.walk_in_booking_id
  LEFT JOIN (
    SELECT 
      walk_in_booking_id,
      SUM(CASE WHEN is_addon = 1 THEN price ELSE 0 END) as total_addon_amount
    FROM walk_in_booking_services 
    WHERE walk_in_booking_id IS NOT NULL
    GROUP BY walk_in_booking_id
  ) addon_services ON w.id = addon_services.walk_in_booking_id
  LEFT JOIN walk_in_booking_services wbs_all ON w.id = wbs_all.walk_in_booking_id
  LEFT JOIN grooming_services primary_gs ON wbs_all.service_id = primary_gs.id AND wbs_all.is_addon = 0
  LEFT JOIN grooming_services addon_gs ON wbs_all.service_id = addon_gs.id AND wbs_all.is_addon = 1
  WHERE w.status IN ('completed', 'cancelled')
`;
    
    const params = [];
    const conditions = [];
    
    if (filters.transaction_type) {
      if (filters.transaction_type === 'appointment') {
        walkInQuery = `
          SELECT 
            1 as id,
            'walk_in' as transaction_type,
            NULL as appointment_id,
            1 as walk_in_booking_id,
            NULL as customer_id,
            NULL as customer_name,
            NULL as pet_id,
            NULL as pet_name,
            NULL as service_id,
            NULL as service_name,
            NULL as base_amount,
            NULL as matted_coat_fee,
            NULL as addon_services_amount,
            NULL as total_amount,
            NULL as payment_method,
            NULL as payment_status,
            NULL as groomer_id,
            NULL as groomer_name,
            NULL as transaction_status,
            NULL as service_date,
            NULL as queue_number,
            NULL as refund_status,
            NULL as created_at,
            NULL as updated_at,
            NULL as addon_services_list
          WHERE 1=0
        `;
      } else if (filters.transaction_type === 'walk_in') {
        appointmentQuery = `
          SELECT 
            1 as id,
            'appointment' as transaction_type,
            1 as appointment_id,
            NULL as walk_in_booking_id,
            NULL as customer_id,
            NULL as customer_name,
            NULL as pet_id,
            NULL as pet_name,
            NULL as service_id,
            NULL as service_name,
            NULL as base_amount,
            NULL as matted_coat_fee,
            NULL as addon_services_amount,
            NULL as total_amount,
            NULL as payment_method,
            NULL as payment_status,
            NULL as groomer_id,
            NULL as groomer_name,
            NULL as transaction_status,
            NULL as service_date,
            NULL as queue_number,
            NULL as refund_status,
            NULL as created_at,
            NULL as updated_at,
            NULL as addon_services_list
          WHERE 1=0
        `;
      }
    }
    
    // Add date filters and GROUP BY only to non-empty queries
    if (filters.transaction_type !== 'walk_in') {
      if (filters.start_date) {
        appointmentQuery += ' AND COALESCE(a.actual_date, a.preferred_date) >= ?';
      }
      if (filters.end_date) {
        appointmentQuery += ' AND COALESCE(a.actual_date, a.preferred_date) <= ?';
      }
      appointmentQuery += ' GROUP BY a.id';
    }
    
    if (filters.transaction_type !== 'appointment') {
      if (filters.start_date) {
        walkInQuery += ' AND DATE(w.created_at) >= ?';
      }
      if (filters.end_date) {
        walkInQuery += ' AND DATE(w.created_at) <= ?';
      }
      walkInQuery += ' GROUP BY w.id';
    }
    
    const combinedQuery = `
      (${appointmentQuery})
      UNION ALL
      (${walkInQuery})
      ORDER BY service_date DESC, created_at DESC
    `;
    
    // Add parameters for date filters based on transaction type
    if (filters.start_date) {
      if (filters.transaction_type !== 'walk_in') {
        params.push(filters.start_date);
      }
      if (filters.transaction_type !== 'appointment') {
        params.push(filters.start_date);
      }
    }
    if (filters.end_date) {
      if (filters.transaction_type !== 'walk_in') {
        params.push(filters.end_date);
      }
      if (filters.transaction_type !== 'appointment') {
        params.push(filters.end_date);
      }
    }
    
    if (filters.limit) {
      combinedQuery += ' LIMIT ?';
      params.push(parseInt(filters.limit));
    }
    
    const [rows] = await db.execute(combinedQuery, params);
    
    // Apply client-side filters for complex conditions
    let filteredRows = rows;
    
    if (filters.payment_method) {
      filteredRows = filteredRows.filter(row => row.payment_method === filters.payment_method);
    }
    
    if (filters.transaction_status) {
      filteredRows = filteredRows.filter(row => row.transaction_status === filters.transaction_status);
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredRows = filteredRows.filter(row => 
        row.customer_name?.toLowerCase().includes(searchTerm) ||
        row.pet_name?.toLowerCase().includes(searchTerm) ||
        row.service_name?.toLowerCase().includes(searchTerm)
      );
    }
    
    return filteredRows;
  }

  // Get transaction statistics
  static async getStatistics(filters = {}) {
    let query = `
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'Cash' AND status = 'completed' THEN total_amount ELSE 0 END), 0) as cash_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'Gcash' AND status = 'completed' THEN total_amount ELSE 0 END), 0) as gcash_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_transactions,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_transactions,
        0 as refunded_transactions,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN total_amount END), 0) as average_transaction_value
      FROM (
        SELECT total_amount, payment_method, status FROM appointments WHERE status IN ('completed', 'cancelled')
        UNION ALL
        SELECT total_amount, payment_method, status FROM walk_in_bookings WHERE status IN ('completed', 'cancelled')
      ) combined_transactions
      WHERE 1=1
    `;
    
    const params = [];
    
    // Note: Date filtering would be more complex here, so keeping it simple for now
    
    const [rows] = await db.execute(query, params);
    return rows[0] || {
      total_transactions: 0,
      total_revenue: 0,
      cash_revenue: 0,
      gcash_revenue: 0,
      completed_transactions: 0,
      cancelled_transactions: 0,
      refunded_transactions: 0,
      average_transaction_value: 0
    };
  }
}

module.exports = TransactionHistory;