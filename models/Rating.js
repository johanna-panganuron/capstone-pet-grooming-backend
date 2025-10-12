// models/Rating.js
const db = require('./db');

class Rating {
  /**
   * Create a new rating for appointment
   */
  static async create(ratingData) {
    const {
      appointment_id,
      customer_id,
      rating,
      review,
      aspects = {}
    } = ratingData;

    // Validate required fields
    if (!appointment_id || !customer_id || !rating) {
      throw new Error('Missing required fields: appointment_id, customer_id, rating');
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    try {
      // Check if rating already exists for this appointment
      const [existingRating] = await db.execute(
        'SELECT id FROM ratings WHERE appointment_id = ?',
        [appointment_id]
      );

      if (existingRating.length > 0) {
        throw new Error('Rating already exists for this appointment');
      }

      // Verify appointment exists and belongs to customer
      const [appointmentRows] = await db.execute(
        'SELECT id, owner_id, status FROM appointments WHERE id = ? AND owner_id = ?',
        [appointment_id, customer_id]
      );

      if (appointmentRows.length === 0) {
        throw new Error('Appointment not found or does not belong to this customer');
      }

      const appointment = appointmentRows[0];
      if (appointment.status !== 'completed') {
        throw new Error('Can only rate completed appointments');
      }

      // Insert rating
      const [result] = await db.execute(`
        INSERT INTO ratings 
        (appointment_id, customer_id, rating, review, staff_rating, service_rating, cleanliness_rating, value_rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        appointment_id,
        customer_id,
        rating,
        review || null,
        aspects.staff || 0,
        aspects.service || 0,
        aspects.cleanliness || 0,
        aspects.value || 0
      ]);

      console.log(`✅ Appointment rating created: ID ${result.insertId} for appointment ${appointment_id}`);
      return result.insertId;

    } catch (error) {
      console.error('❌ Error creating appointment rating:', error);
      throw error;
    }
  }

  /**
   * Create a new rating for walk-in booking
   */
  static async createWalkInRating(ratingData) {
    const {
      walk_in_booking_id,
      customer_id,
      rating,
      review,
      aspects = {}
    } = ratingData;

    // Validate required fields
    if (!walk_in_booking_id || !customer_id || !rating) {
      throw new Error('Missing required fields: walk_in_booking_id, customer_id, rating');
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    try {
      // Check if rating already exists for this walk-in booking
      const [existingRating] = await db.execute(
        'SELECT id FROM walk_in_ratings WHERE walk_in_booking_id = ?',
        [walk_in_booking_id]
      );

      if (existingRating.length > 0) {
        throw new Error('Rating already exists for this walk-in booking');
      }

      // Verify walk-in booking exists and belongs to customer
      const [bookingRows] = await db.execute(
        'SELECT id, owner_id, status FROM walk_in_bookings WHERE id = ? AND owner_id = ?',
        [walk_in_booking_id, customer_id]
      );

      if (bookingRows.length === 0) {
        throw new Error('Walk-in booking not found or does not belong to this customer');
      }

      const booking = bookingRows[0];
      if (booking.status !== 'completed') {
        throw new Error('Can only rate completed bookings');
      }

      // Insert walk-in rating
      const [result] = await db.execute(`
        INSERT INTO walk_in_ratings 
        (walk_in_booking_id, customer_id, rating, review, staff_friendliness, service_quality, cleanliness, value_for_money)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        walk_in_booking_id,
        customer_id,
        rating,
        review || null,
        aspects.staff || 0,
        aspects.service || 0,
        aspects.cleanliness || 0,
        aspects.value || 0
      ]);

      console.log(`✅ Walk-in rating created: ID ${result.insertId} for booking ${walk_in_booking_id}`);
      return result.insertId;

    } catch (error) {
      console.error('❌ Error creating walk-in rating:', error);
      throw error;
    }
  }

  /**
   * Get all ratings combined (appointments + walk-ins)
   */
  static async getAllCombined(filters = {}) {
    try {
      let whereConditions = [];
      let params = [];

      // Build filtering conditions
      if (filters.rating) {
        whereConditions.push('rating = ?');
        params.push(filters.rating);
      }

      if (filters.customer_id) {
        whereConditions.push('customer_id = ?');
        params.push(filters.customer_id);
      }

      if (filters.service_id) {
        whereConditions.push('service_id = ?');
        params.push(filters.service_id);
      }

      if (filters.date_from) {
        whereConditions.push('created_at >= ?');
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        whereConditions.push('created_at <= ?');
        params.push(filters.date_to);
      }

      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
      const orderBy = `ORDER BY created_at ${filters.sortOrder || 'DESC'}`;
      const limit = filters.limit ? `LIMIT ${parseInt(filters.limit)}` : '';
      const offset = filters.page && filters.limit ? `OFFSET ${(parseInt(filters.page) - 1) * parseInt(filters.limit)}` : '';

      const query = `
        (
          SELECT 
            r.id,
            r.appointment_id as booking_id,
            NULL as walk_in_booking_id,
            r.customer_id,
            r.rating,
            r.review,
            r.staff_rating as staff_friendliness,
            r.service_rating as service_quality,
            r.cleanliness_rating as cleanliness,
            r.value_rating as value_for_money,
            r.created_at,
            u.name as customer_name,
            u.profile_photo_url as customer_photo,
            gs.name as service_name,
            gs.id as service_id,
            p.name as pet_name,
            p.photo_url as pet_photo,
            COALESCE(a.actual_date, a.preferred_date) as service_date,
            'appointment' as booking_type
          FROM ratings r
          LEFT JOIN users u ON r.customer_id = u.id
          LEFT JOIN appointments a ON r.appointment_id = a.id
          LEFT JOIN grooming_services gs ON a.service_id = gs.id
          LEFT JOIN pets p ON a.pet_id = p.id
          WHERE r.status = 'active'
        )
        UNION ALL
        (
          SELECT 
            wr.id,
            NULL as booking_id,
            wr.walk_in_booking_id,
            wr.customer_id,
            wr.rating,
            wr.review,
            wr.staff_friendliness,
            wr.service_quality,
            wr.cleanliness,
            wr.value_for_money,
            wr.created_at,
            u.name as customer_name,
            u.profile_photo_url as customer_photo,
            gs.name as service_name,
            gs.id as service_id,
            p.name as pet_name,
            p.photo_url as pet_photo,
            DATE(wb.created_at) as service_date,
            'walk_in' as booking_type
          FROM walk_in_ratings wr
          LEFT JOIN users u ON wr.customer_id = u.id
          LEFT JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
          LEFT JOIN grooming_services gs ON wb.service_id = gs.id
          LEFT JOIN pets p ON wb.pet_id = p.id
        )
        ${whereClause}
        ${orderBy}
        ${limit} ${offset}
      `;

      const [rows] = await db.execute(query, params);
      return rows.map(row => this.formatCombinedRatingData(row));

    } catch (error) {
      console.error('❌ Error fetching combined ratings:', error);
      throw error;
    }
  }

  /**
   * Get average rating from both appointment and walk-in ratings
   */
  static async getCombinedAverageRating(serviceId = null) {
    try {
      let query = `
        SELECT 
          AVG(combined_rating) as average_rating,
          COUNT(*) as total_ratings,
          AVG(staff_avg) as avg_staff_rating,
          AVG(service_avg) as avg_service_rating,
          AVG(cleanliness_avg) as avg_cleanliness_rating,
          AVG(value_avg) as avg_value_rating
        FROM (
          SELECT 
            rating as combined_rating,
            staff_rating as staff_avg,
            service_rating as service_avg,
            cleanliness_rating as cleanliness_avg,
            value_rating as value_avg
          FROM ratings r
          LEFT JOIN appointments a ON r.appointment_id = a.id
          WHERE r.status = 'active'
          ${serviceId ? 'AND a.service_id = ?' : ''}
          UNION ALL
          SELECT 
            rating as combined_rating,
            staff_friendliness as staff_avg,
            service_quality as service_avg,
            cleanliness as cleanliness_avg,
            value_for_money as value_avg
          FROM walk_in_ratings wr
          LEFT JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
          ${serviceId ? 'WHERE wb.service_id = ?' : ''}
        ) combined_ratings
      `;
      
      const params = serviceId ? [serviceId, serviceId] : [];
      const [rows] = await db.execute(query, params);
      
      const result = rows[0];
      return {
        average_rating: parseFloat(result.average_rating) || 0,
        total_ratings: parseInt(result.total_ratings) || 0,
        avg_staff_rating: parseFloat(result.avg_staff_rating) || 0,
        avg_service_rating: parseFloat(result.avg_service_rating) || 0,
        avg_cleanliness_rating: parseFloat(result.avg_cleanliness_rating) || 0,
        avg_value_rating: parseFloat(result.avg_value_rating) || 0
      };
    } catch (error) {
      console.error('❌ Error getting combined average rating:', error);
      throw error;
    }
  }

  /**
   * Get combined rating distribution
   */
  static async getCombinedRatingDistribution(serviceId = null) {
    try {
      let query = `
        SELECT 
          combined_rating as rating,
          COUNT(*) as count
        FROM (
          SELECT rating as combined_rating
          FROM ratings r
          LEFT JOIN appointments a ON r.appointment_id = a.id
          WHERE r.status = 'active'
          ${serviceId ? 'AND a.service_id = ?' : ''}
          UNION ALL
          SELECT rating as combined_rating
          FROM walk_in_ratings wr
          LEFT JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
          ${serviceId ? 'WHERE wb.service_id = ?' : ''}
        ) combined_ratings
        GROUP BY combined_rating
        ORDER BY combined_rating DESC
      `;
      
      const params = serviceId ? [serviceId, serviceId] : [];
      const [rows] = await db.execute(query, params);
      
      // Initialize distribution with zeros
      const distribution = {
        5: 0, 4: 0, 3: 0, 2: 0, 1: 0
      };
      
      // Fill in actual counts
      rows.forEach(row => {
        if (row.rating >= 1 && row.rating <= 5) {
          distribution[row.rating] = parseInt(row.count);
        }
      });
      
      return distribution;
    } catch (error) {
      console.error('❌ Error getting combined rating distribution:', error);
      throw error;
    }
  }

  /**
   * Get recent ratings from both types
   */
  static async getRecentCombined(limit = 10) {
    try {
      const query = `
        (
          SELECT 
            r.id,
            'appointment' as type,
            r.rating,
            r.review,
            r.created_at,
            u.name as customer_name,
            u.profile_photo_url as customer_photo,
            gs.name as service_name,
            p.name as pet_name
          FROM ratings r
          LEFT JOIN users u ON r.customer_id = u.id
          LEFT JOIN appointments a ON r.appointment_id = a.id
          LEFT JOIN grooming_services gs ON a.service_id = gs.id
          LEFT JOIN pets p ON a.pet_id = p.id
          WHERE r.status = 'active'
        )
        UNION ALL
        (
          SELECT 
            wr.id,
            'walk_in' as type,
            wr.rating,
            wr.review,
            wr.created_at,
            u.name as customer_name,
            u.profile_photo_url as customer_photo,
            gs.name as service_name,
            p.name as pet_name
          FROM walk_in_ratings wr
          LEFT JOIN users u ON wr.customer_id = u.id
          LEFT JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
          LEFT JOIN grooming_services gs ON wb.service_id = gs.id
          LEFT JOIN pets p ON wb.pet_id = p.id
        )
        ORDER BY created_at DESC
        LIMIT ?
      `;

      const [rows] = await db.execute(query, [limit]);
      return rows.map(row => this.formatCombinedRatingData(row));

    } catch (error) {
      console.error('❌ Error getting recent combined ratings:', error);
      throw error;
    }
  }

  /**
   * Format combined rating data
   */
  static formatCombinedRatingData(row) {
    return {
      id: row.id,
      booking_id: row.booking_id,
      walk_in_booking_id: row.walk_in_booking_id,
      customer_id: row.customer_id,
      rating: row.rating,
      review: row.review,
      staff_friendliness: row.staff_friendliness || 0,
      service_quality: row.service_quality || 0,
      cleanliness: row.cleanliness || 0,
      value_for_money: row.value_for_money || 0,
      created_at: row.created_at,
      
      // Customer info
      customer_name: row.customer_name,
      customer_photo: row.customer_photo,
      
      // Service info
      service_name: row.service_name,
      service_id: row.service_id,
      pet_name: row.pet_name,
      pet_photo: row.pet_photo,
      service_date: row.service_date,
      booking_type: row.booking_type || row.type
    };
  }

  // Keep existing methods for backward compatibility
  static async findById(id) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          r.*,
          u.name as customer_name,
          u.profile_photo_url as customer_photo,
          a.service_id,
          a.preferred_date,
          a.actual_date,
          gs.name as service_name,
          p.name as pet_name,
          p.photo_url as pet_photo
        FROM ratings r
        LEFT JOIN users u ON r.customer_id = u.id
        LEFT JOIN appointments a ON r.appointment_id = a.id
        LEFT JOIN grooming_services gs ON a.service_id = gs.id
        LEFT JOIN pets p ON a.pet_id = p.id
        WHERE r.id = ?
      `, [id]);

      if (rows.length === 0) return null;
      return this.formatRatingData(rows[0]);
    } catch (error) {
      console.error('❌ Error finding rating by ID:', error);
      throw error;
    }
  }

  static formatRatingData(row) {
    return {
      id: row.id,
      appointment_id: row.appointment_id,
      customer_id: row.customer_id,
      rating: row.rating,
      review: row.review,
      aspects: {
        staff: row.staff_rating || 0,
        service: row.service_rating || 0,
        cleanliness: row.cleanliness_rating || 0,
        value: row.value_rating || 0
      },
      staff_rating: row.staff_rating || 0,
      service_rating: row.service_rating || 0,
      cleanliness_rating: row.cleanliness_rating || 0,
      value_rating: row.value_rating || 0,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      
      // Customer info
      customer_name: row.customer_name,
      customer_photo: row.customer_photo,
      
      // Service info
      service_name: row.service_name,
      pet_name: row.pet_name,
      pet_photo: row.pet_photo,
      service_date: row.actual_date || row.preferred_date
    };
  }
}

module.exports = Rating;