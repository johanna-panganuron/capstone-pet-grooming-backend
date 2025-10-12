// models/Payment.js
const db = require('./db');

class Payment {
  static async create(paymentData) {
    const requiredFields = [
      'appointment_id', 'user_id', 'amount', 'payment_method'
    ];

    const missingFields = requiredFields.filter(field => !paymentData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const sql = `
      INSERT INTO payments 
      (appointment_id, user_id, amount, payment_method, status, 
       gcash_transaction_id, gcash_payment_url, external_reference,
       gcash_response, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.query(sql, [
      paymentData.appointment_id,
      paymentData.user_id,
      paymentData.amount,
      paymentData.payment_method,
      paymentData.status || 'pending',
      paymentData.gcash_transaction_id || null,
      paymentData.gcash_payment_url || null,
      paymentData.external_reference || null,
      paymentData.gcash_response || null,
      paymentData.notes || null
    ]);
    
    return result.insertId;
  }

  static async findById(paymentId) {
    const sql = `SELECT * FROM payments WHERE id = ?`;
    const [rows] = await db.query(sql, [paymentId]);
    return rows[0] || null;
  }
  static async findByGCashTransaction(transactionId) {
    const sql = `SELECT * FROM payments WHERE gcash_transaction_id = ?`;
    const [rows] = await db.query(sql, [transactionId]);
    return rows[0] || null;
  }
  
  static async findByReference(referenceNumber) {
    const sql = `SELECT * FROM payments WHERE external_reference = ?`;
    const [rows] = await db.query(sql, [referenceNumber]);
    return rows[0] || null;
  }
  
  static async updateStatusByTransactionId(transactionId, status, paidAt = null) {
    const sql = `
      UPDATE payments 
      SET status = ?, paid_at = ?
      WHERE gcash_transaction_id = ?
    `;
    const [result] = await db.query(sql, [status, paidAt, transactionId]);
    return result.affectedRows > 0;
  }
  static async findByIdWithDetails(paymentId) {
    const sql = `
      SELECT 
        p.*,
        a.preferred_date,
        a.preferred_time,
        a.status as appointment_status,
        pet.name as pet_name,
        gs.name as service_name,
        u.name as user_name,
        u.email as user_email
      FROM payments p
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN pets pet ON a.pet_id = pet.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;
    
    const [rows] = await db.query(sql, [paymentId]);
    return rows[0] || null;
  }

  static async findByGCashTransaction(transactionId) {
    const sql = `SELECT * FROM payments WHERE gcash_transaction_id = ?`;
    const [rows] = await db.query(sql, [transactionId]);
    return rows[0] || null;
  }

  static async findByReference(referenceNumber) {
    const sql = `SELECT * FROM payments WHERE external_reference = ?`;
    const [rows] = await db.query(sql, [referenceNumber]);
    return rows[0] || null;
  }

  static async findByAppointment(appointmentId) {
    const sql = `
        SELECT * FROM payments 
        WHERE appointment_id = ? 
        ORDER BY created_at ASC
    `;
    const [rows] = await db.query(sql, [appointmentId]);
    return rows;
}

  static async findByUserWithDetails(userId) {
    const sql = `
      SELECT 
        p.*,
        a.preferred_date,
        a.preferred_time,
        a.status as appointment_status,
        pet.name as pet_name,
        pet.photo_url as pet_photo,
        gs.name as service_name,
        gs.category as service_category
      FROM payments p
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN pets pet ON a.pet_id = pet.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `;
    
    const [rows] = await db.query(sql, [userId]);
    
    return rows.map(row => ({
      id: row.id,
      appointment_id: row.appointment_id,
      amount: parseFloat(row.amount),
      payment_method: row.payment_method,
      status: row.status,
      external_reference: row.external_reference,
      paid_at: row.paid_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Appointment details
      appointment: {
        preferred_date: row.preferred_date,
        preferred_time: row.preferred_time,
        status: row.appointment_status,
        pet_name: row.pet_name,
        pet_photo: row.pet_photo,
        service_name: row.service_name,
        service_category: row.service_category
      }
    }));
  }

  static async update(paymentId, updateData) {
    const allowedFields = [
      'status', 'gcash_transaction_id', 'gcash_payment_url', 
      'external_reference', 'gcash_response', 'paid_at', 
      'cancelled_at', 'notes'
    ];
    
    const updateFields = [];
    const updateValues = [];
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(updateData[key]);
      }
    });
    
    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    updateValues.push(paymentId);
    
    const sql = `
      UPDATE payments 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const [result] = await db.query(sql, updateValues);
    return result.affectedRows > 0;
  }

  static async updateStatus(paymentId, status) {
    const sql = `
      UPDATE payments 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const [result] = await db.query(sql, [status, paymentId]);
    return result.affectedRows > 0;
  }

  // Get payment statistics for admin/reports
  static async getPaymentStats(startDate = null, endDate = null) {
    let sql = `
      SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        AVG(CASE WHEN status = 'completed' THEN amount END) as avg_payment_amount
      FROM payments
      WHERE 1=1
    `;
    
    const params = [];
    
    if (startDate) {
      sql += ` AND created_at >= ?`;
      params.push(startDate);
    }
    
    if (endDate) {
      sql += ` AND created_at <= ?`;
      params.push(endDate);
    }
    
    const [rows] = await db.query(sql, params);
    return rows[0];
  }

  // Get recent payments for admin dashboard
  static async getRecentPayments(limit = 10) {
    const sql = `
      SELECT 
        p.*,
        u.name as user_name,
        u.email as user_email,
        pet.name as pet_name,
        gs.name as service_name
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN appointments a ON p.appointment_id = a.id
      LEFT JOIN pets pet ON a.pet_id = pet.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      ORDER BY p.created_at DESC
      LIMIT ?
    `;
    
    const [rows] = await db.query(sql, [limit]);
    
    return rows.map(row => ({
      id: row.id,
      appointment_id: row.appointment_id,
      amount: parseFloat(row.amount),
      payment_method: row.payment_method,
      status: row.status,
      external_reference: row.external_reference,
      paid_at: row.paid_at,
      created_at: row.created_at,
      user_name: row.user_name,
      user_email: row.user_email,
      pet_name: row.pet_name,
      service_name: row.service_name
    }));
  }

  static async delete(paymentId) {
    // Note: In most cases, payments should not be deleted but marked as cancelled
    // This method is provided for admin cleanup purposes only
    const sql = `DELETE FROM payments WHERE id = ?`;
    const [result] = await db.query(sql, [paymentId]);
    return result.affectedRows > 0;
  }

  // Check if appointment has any successful payments
  static async hasSuccessfulPayment(appointmentId) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM payments 
      WHERE appointment_id = ? AND status = 'completed'
    `;
    const [rows] = await db.query(sql, [appointmentId]);
    return rows[0].count > 0;
  }

  // Get total revenue for a date range
  static async getTotalRevenue(startDate, endDate) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) as total_revenue
      FROM payments 
      WHERE status = 'completed'
      AND paid_at >= ? AND paid_at <= ?
    `;
    const [rows] = await db.query(sql, [startDate, endDate]);
    return parseFloat(rows[0].total_revenue);
  }

  // Get payment method distribution
  static async getPaymentMethodStats() {
    const sql = `
      SELECT 
        payment_method,
        COUNT(*) as payment_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount
      FROM payments
      GROUP BY payment_method
      ORDER BY payment_count DESC
    `;
    const [rows] = await db.query(sql);
    
    return rows.map(row => ({
      payment_method: row.payment_method,
      payment_count: parseInt(row.payment_count),
      total_amount: parseFloat(row.total_amount)
    }));
  }
}

module.exports = Payment;