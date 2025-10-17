// models/WalkInBooking.js
const db = require('./db');

class WalkInBooking {
static async findById(bookingId) {
  return await this.getWalkInBookingByIdWithServices(bookingId);
}
  // Get all pet owners (for search)
  static async searchPetOwners(searchTerm) {
    const query = `
      SELECT id, name, contact_number, email 
      FROM users 
      WHERE role = 'pet_owner' 
      AND (name LIKE ? OR email LIKE ? OR contact_number LIKE ?)
      ORDER BY name ASC
      LIMIT 10
    `;
    const searchPattern = `%${searchTerm}%`;
    const [rows] = await db.execute(query, [searchPattern, searchPattern, searchPattern]);
    return rows;
  }

  // Get pets by owner ID
  static async getPetsByOwner(ownerId) {
    const query = `
      SELECT id, name, breed, type, gender, size, weight, age, photo_url
      FROM pets 
      WHERE user_id = ?
      ORDER BY name ASC
    `;
    const [rows] = await db.execute(query, [ownerId]);
    return rows;
  }

  // Search pets by name and owner
  static async searchPets(searchTerm, ownerId = null) {
    let query = `
      SELECT p.id, p.name, p.breed, p.type, p.gender, p.size, p.weight, p.age, p.photo_url,
             u.name as owner_name, u.id as owner_id, u.contact_number
      FROM pets p
      JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner'
      AND p.name LIKE ?
    `;
    const params = [`%${searchTerm}%`];

    if (ownerId) {
      query += ` AND p.user_id = ?`;
      params.push(ownerId);
    }

    query += ` ORDER BY p.name ASC LIMIT 10`;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  // Get all available grooming services
static async getGroomingServices() {
  const query = `
    SELECT id, name, description, image_url, 
           price_xs, price_small, price_medium, price_large, price_xl, price_xxl,
           time_description, category
    FROM grooming_services 
    WHERE status = 'available'
    ORDER BY category, name ASC
  `;
  const [rows] = await db.execute(query);
  
  // Add this debug log to see what's coming from the database
  console.log('Services from DB:', JSON.stringify(rows, null, 2));
  
  return rows;
}

  // Get price for specific service and pet size
  static async getServicePrice(serviceId, petSize) {
    const sizeColumn = `price_${petSize.toLowerCase()}`;
    const query = `SELECT ${sizeColumn} as price, name FROM grooming_services WHERE id = ?`;
    const [rows] = await db.execute(query, [serviceId]);
    return rows[0];
  }

  // Get available groomers
  static async getAvailableGroomers() {
    const query = `
      SELECT id, name, contact_number, email, profile_photo_url
      FROM users 
      WHERE role = 'staff' 
      AND staff_type = 'Groomer' 
      AND status = 'Active'
      ORDER BY name ASC
    `;
    const [rows] = await db.execute(query);
    return rows;
  }
  static async createWalkInBookingWithServices(bookingData) {
    const connection = await db.getConnection();
  
    try {
      await connection.beginTransaction();
  
      const {
        pet_id,
        owner_id,
        service_ids,
        groomer_id,
        base_price,
        matted_coat_fee,
        total_amount,
        special_notes,
        queue_number,
        time_slot,
        payment_method,
        payment_status
      } = bookingData;
  
      // Create the main booking record
      const primaryServiceId = service_ids[0];
      const bookingQuery = `
        INSERT INTO walk_in_bookings 
        (pet_id, owner_id, service_id, groomer_id, base_price, matted_coat_fee, 
         total_amount, special_notes, queue_number, time_slot, payment_method, payment_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `;
  
      const [bookingResult] = await connection.execute(bookingQuery, [
        pet_id, owner_id, primaryServiceId, groomer_id, base_price, matted_coat_fee,
        total_amount, special_notes, queue_number, time_slot, payment_method, payment_status
      ]);
  
      const bookingId = bookingResult.insertId;
  
      // Record initial payment
      const initialPaymentQuery = `
        INSERT INTO walk_in_booking_payments 
        (walk_in_booking_id, payment_method, amount, payment_type, service_ids)
        VALUES (?, ?, ?, 'initial', ?)
      `;
      await connection.execute(initialPaymentQuery, [
        bookingId, 
        payment_method, 
        total_amount,
        JSON.stringify(service_ids) // Store which services this payment covers
      ]);
  
      // Insert services for this booking
      const pet = await this.getPetById(pet_id);
      const petSize = pet.size.toLowerCase();
  
      for (const serviceId of service_ids) {
        const service = await this.getServiceById(serviceId);
        const priceColumn = `price_${petSize}`;
        const servicePrice = service[priceColumn];
  
        const serviceQuery = `
          INSERT INTO walk_in_booking_services (walk_in_booking_id, service_id, price, is_addon)
          VALUES (?, ?, ?, ?)
        `;
        await connection.execute(serviceQuery, [bookingId, serviceId, servicePrice, false]);
      }
  
      await connection.commit();
      return bookingId;
  
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getTodayWalkInBookingsWithServices() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT wb.*, 
             u.name as owner_name, u.contact_number as owner_contact, u.email as owner_email,
             u.profile_photo_url as owner_photo_url,
             p.name as pet_name, p.breed, p.type, p.size, p.photo_url as pet_photo_url,
             g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
             CASE WHEN wb.before_photo IS NOT NULL OR wb.after_photo IS NOT NULL 
                  THEN 1 ELSE 0 END as has_photos
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE DATE(wb.created_at) = ?
      ORDER BY wb.queue_number ASC, wb.created_at ASC
    `;
    const [rows] = await db.execute(query, [today]);
  
    // Get services and session data for each booking
    for (let booking of rows) {
      // Get services for this booking
      const servicesQuery = `
        SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
        FROM walk_in_booking_services wbs
        JOIN grooming_services gs ON wbs.service_id = gs.id
        WHERE wbs.walk_in_booking_id = ?
        ORDER BY wbs.is_addon ASC, wbs.id ASC
      `;
      const [serviceRows] = await db.execute(servicesQuery, [booking.id]);
      booking.services = serviceRows;
  
      // Map photo URLs for frontend consistency
      booking.before_photo_url = booking.before_photo;
      booking.after_photo_url = booking.after_photo;
      booking.has_before_photo = !!booking.before_photo;
      booking.has_after_photo = !!booking.after_photo;
  
      // For backward compatibility, set service_name to first service
      booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';
  
      // Get payment history for this booking
      const paymentQuery = `
        SELECT payment_method, amount, payment_type, service_ids, created_at
        FROM walk_in_booking_payments
        WHERE walk_in_booking_id = ?
        ORDER BY created_at ASC
      `;
      const [paymentRows] = await db.execute(paymentQuery, [booking.id]);
      booking.payment_history = paymentRows.map(payment => ({
        ...payment,
        service_ids: payment.service_ids ? JSON.parse(payment.service_ids) : []
      }));
  
      // Add active session data for in-progress bookings
      if (booking.status === 'in_progress') {
        const activeSessionQuery = `
          SELECT gs.id, gs.start_time, gs.groomer_id, gs.status, gs.notes,
                 u.name as groomer_name
          FROM grooming_sessions gs
          JOIN users u ON gs.groomer_id = u.id
          WHERE gs.walk_in_booking_id = ? AND gs.status = 'active'
          ORDER BY gs.start_time DESC
          LIMIT 1
        `;
        const [sessionRows] = await db.execute(activeSessionQuery, [booking.id]);
        booking.active_session = sessionRows[0] || null;
      } else {
        booking.active_session = null;
      }
  
      // Get completed session history
      const sessionHistoryQuery = `
        SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
               gs.end_time, gs.duration_minutes, gs.status, gs.notes,
               u.name as groomer_name
        FROM grooming_sessions gs
        JOIN users u ON gs.groomer_id = u.id
        WHERE gs.walk_in_booking_id = ? AND gs.status = 'completed'
        ORDER BY gs.start_time DESC
      `;
      const [historyRows] = await db.execute(sessionHistoryQuery, [booking.id]);
      booking.session_history = historyRows;
    }
  
    return rows;
  }

  static async addServicesToBooking(bookingId, serviceIds, paymentMethod, mattedCoatFeeData = null) {
    console.log('🔍 addServicesToBooking called with:', {
      bookingId,
      serviceIds,
      paymentMethod,
      mattedCoatFeeData,
      paymentMethodType: typeof paymentMethod
    });
  
    const connection = await db.getConnection();
  
    try {
      await connection.beginTransaction();
  
      // Get booking details including pet size
      const bookingQuery = `
        SELECT wb.*, p.size 
        FROM walk_in_bookings wb
        JOIN pets p ON wb.pet_id = p.id
        WHERE wb.id = ?
      `;
      const [bookingRows] = await connection.execute(bookingQuery, [bookingId]);
  
      if (bookingRows.length === 0) {
        throw new Error('Booking not found');
      }
  
      const booking = bookingRows[0];
      const petSize = booking.size.toLowerCase();
  
      let addOnTotal = 0;
      const addedServices = [];
      let mattedCoatFeeAdded = 0;
  
      // Add services if provided
      if (serviceIds && serviceIds.length > 0) {
        for (const serviceId of serviceIds) {
          const serviceQuery = `
            SELECT id, name, 
                   COALESCE(price_${petSize}, price_medium, price_small, 0) as price 
            FROM grooming_services 
            WHERE id = ? AND status = 'available'
          `;
          const [serviceRows] = await connection.execute(serviceQuery, [serviceId]);
  
          if (serviceRows.length === 0) {
            throw new Error(`Service with ID ${serviceId} not found or not available`);
          }
  
          const service = serviceRows[0];
          let servicePrice = 0;
          if (service.price !== null && service.price !== undefined) {
            const parsed = parseFloat(service.price);
            servicePrice = isNaN(parsed) ? 0 : parsed;
          }
  
          // Check if service is already added
          const existingServiceQuery = `
            SELECT id FROM walk_in_booking_services 
            WHERE walk_in_booking_id = ? AND service_id = ?
          `;
          const [existingRows] = await connection.execute(existingServiceQuery, [bookingId, serviceId]);
  
          if (existingRows.length === 0) {
            // Insert the service with is_addon = TRUE
            const insertServiceQuery = `
              INSERT INTO walk_in_booking_services (walk_in_booking_id, service_id, price, is_addon)
              VALUES (?, ?, ?, ?)
            `;
  
            await connection.execute(insertServiceQuery, [bookingId, serviceId, servicePrice, true]);
  
            addOnTotal += servicePrice;
            addedServices.push({
              id: serviceId,
              name: service.name,
              price: servicePrice
            });
          }
        }
      }
  
      // Add matted coat fee if provided and not already applied
      if (mattedCoatFeeData && mattedCoatFeeData.add_matted_coat_fee) {
        if (parseFloat(booking.matted_coat_fee) === 0) {
          const mattedCoatAmount = parseFloat(mattedCoatFeeData.amount) || 80;
          
          // Update the booking's matted coat fee
          const updateMattedCoatQuery = `
            UPDATE walk_in_bookings 
            SET matted_coat_fee = ?
            WHERE id = ?
          `;
          await connection.execute(updateMattedCoatQuery, [mattedCoatAmount, bookingId]);
          
          addOnTotal += mattedCoatAmount;
          mattedCoatFeeAdded = mattedCoatAmount;
        }
      }
  
      // Record add-on payment if there's any addition
      if (addedServices.length > 0 || mattedCoatFeeAdded > 0) {
        const paymentItems = [];
        
        if (serviceIds && serviceIds.length > 0) {
          paymentItems.push(`services:${JSON.stringify(serviceIds)}`);
        }
        
        if (mattedCoatFeeAdded > 0) {
          paymentItems.push(`matted_coat_fee:${mattedCoatFeeAdded}`);
        }
  
        const paymentQuery = `
          INSERT INTO walk_in_booking_payments 
          (walk_in_booking_id, payment_method, amount, payment_type, service_ids)
          VALUES (?, ?, ?, 'addon', ?)
        `;
        await connection.execute(paymentQuery, [
          bookingId, 
          paymentMethod, 
          addOnTotal,
          JSON.stringify(paymentItems) // Store what this payment covers
        ]);
  
        // Update booking total amount
        const newTotalAmount = parseFloat(booking.total_amount) + addOnTotal;
        const updateBookingQuery = `
          UPDATE walk_in_bookings 
          SET total_amount = ?, updated_at = NOW()
          WHERE id = ?
        `;
        await connection.execute(updateBookingQuery, [newTotalAmount, bookingId]);
      }
  
      await connection.commit();
  
      return {
        success: true,
        addon_total: addOnTotal,
        new_total: parseFloat(booking.total_amount) + addOnTotal,
        services_added: addedServices.length,
        added_services: addedServices,
        matted_coat_fee_added: mattedCoatFeeAdded
      };
  
    } catch (error) {
      await connection.rollback();
      console.error('Error in addServicesToBooking:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  
  // Helper method to get service price by pet size
  static async getServicePriceForPetSize(serviceId, petSize) {
    const sizeColumn = `price_${petSize.toLowerCase()}`;
    const query = `
      SELECT COALESCE(${sizeColumn}, price_medium, price_small, 0) as price, name 
      FROM grooming_services 
      WHERE id = ? AND status = 'available'
    `;
    const [rows] = await db.execute(query, [serviceId]);
    
    if (rows[0]) {
      // Fix this line:
      const rawPrice = rows[0].price;
      rows[0].price = (rawPrice !== null && rawPrice !== undefined) ? parseFloat(rawPrice) || 0 : 0;
    }
    
    return rows[0];
  }

  static async saveGroomingPhotos(bookingId, beforePhoto, afterPhoto) {
    try {
      const query = `
      UPDATE walk_in_bookings 
      SET before_photo = ?, after_photo = ?, has_photos = TRUE
      WHERE id = ?
    `;

      const [result] = await db.execute(query, [
        beforePhoto,
        afterPhoto,
        bookingId
      ]);

      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error saving grooming photos:', error);
      throw error;
    }
  }

static async getWalkInBookingByIdWithServices(bookingId) {
  console.log('🔍 Getting booking with services for ID:', bookingId);
  
  const bookingIdInt = parseInt(bookingId, 10);
  console.log('🔍 Converted ID:', bookingIdInt);
  
  const query = `
    SELECT wb.*, 
           u.name as owner_name, u.contact_number as owner_contact, u.email as owner_email,
           p.name as pet_name, p.breed, p.type, p.size, p.gender,
           g.name as groomer_name, g.profile_photo_url as groomer_photo_url
    FROM walk_in_bookings wb
    JOIN users u ON wb.owner_id = u.id
    JOIN pets p ON wb.pet_id = p.id
    JOIN users g ON wb.groomer_id = g.id
    WHERE wb.id = ?
  `;
  const [rows] = await db.execute(query, [bookingIdInt]);

  if (rows.length === 0) {
    return null;
  }
  
  const booking = rows[0];

  // Debug: Check if grooming_sessions table exists and has data
  try {
    const tableCheckQuery = `SHOW TABLES LIKE 'grooming_sessions'`;
    const [tableExists] = await db.execute(tableCheckQuery);
    console.log('🔍 grooming_sessions table exists:', tableExists.length > 0);

    if (tableExists.length > 0) {
      const sessionCountQuery = `SELECT COUNT(*) as count FROM grooming_sessions WHERE walk_in_booking_id = ?`;
      const [countResult] = await db.execute(sessionCountQuery, [bookingIdInt]);
      console.log('🔍 Total sessions for booking:', countResult[0].count);
      
      // List all sessions for this booking
      const allSessionsQuery = `SELECT * FROM grooming_sessions WHERE walk_in_booking_id = ?`;
      const [allSessions] = await db.execute(allSessionsQuery, [bookingIdInt]);
      console.log('🔍 All sessions data:', allSessions);
    }
  } catch (error) {
    console.error('❌ Error checking sessions table:', error);
  }

  // Initialize session data
  booking.active_session = null;
  booking.session_history = [];

  // Get active session - FIX: Use the correct status values
  const currentSessionQuery = `
  SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
         gs.end_time, gs.duration_minutes, gs.status, gs.notes,
         u.name as groomer_name
  FROM grooming_sessions gs
  JOIN users u ON gs.groomer_id = u.id
  WHERE gs.walk_in_booking_id = ? 
  ORDER BY gs.start_time DESC
  LIMIT 1
`;

try {
  const [currentSessionRows] = await db.execute(currentSessionQuery, [bookingIdInt]);
  
  if (currentSessionRows.length > 0) {
    const session = currentSessionRows[0];
    if (session.status === 'active') {
      booking.active_session = session;
    } else {
      booking.active_session = null; // No active session
    }
  }
} catch (error) {
  console.error('Error querying current session:', error);
}

  // Get ALL sessions (both active and completed) for history
  const sessionHistoryQuery = `
  SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
         gs.end_time, gs.duration_minutes, gs.status, gs.notes,
         u.name as groomer_name
  FROM grooming_sessions gs
  JOIN users u ON gs.groomer_id = u.id
  WHERE gs.walk_in_booking_id = ?
  ORDER BY gs.start_time DESC
`;

try {
  const [sessionHistoryRows] = await db.execute(sessionHistoryQuery, [bookingIdInt]);
  console.log('SESSION HISTORY QUERY RESULT:', sessionHistoryRows); // ADD THIS LINE
  console.log('Query was:', sessionHistoryQuery); // ADD THIS LINE
  console.log('BookingIdInt was:', bookingIdInt); // ADD THIS LINE
  booking.session_history = sessionHistoryRows;
  booking.active_session = null;
} catch (error) {
  console.error('Error querying completed sessions:', error);
  booking.session_history = [];
  booking.active_session = null;
}
  // Get payment history
  const paymentQuery = `
    SELECT payment_method, amount, payment_type, service_ids, created_at
    FROM walk_in_booking_payments
    WHERE walk_in_booking_id = ?
    ORDER BY created_at ASC
  `;
  const [paymentRows] = await db.execute(paymentQuery, [bookingIdInt]);
  
  booking.payment_history = paymentRows.map(payment => ({
    ...payment,
    service_ids: payment.service_ids ? JSON.parse(payment.service_ids) : []
  }));

  // Get services for this booking
  const servicesQuery = `
    SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
    FROM walk_in_booking_services wbs
    JOIN grooming_services gs ON wbs.service_id = gs.id
    WHERE wbs.walk_in_booking_id = ?
    ORDER BY wbs.is_addon ASC, wbs.id ASC
  `;
  const [serviceRows] = await db.execute(servicesQuery, [bookingIdInt]);
  booking.services = serviceRows;

  // Add photo information
  booking.has_before_photo = !!booking.before_photo;
  booking.has_after_photo = !!booking.after_photo;
  booking.has_photos = booking.has_before_photo || booking.has_after_photo;
  booking.before_photo_url = booking.before_photo;
  booking.after_photo_url = booking.after_photo;
  booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';

  console.log('✅ FINAL SESSION DATA:', {
    active_session: !!booking.active_session,
    session_history_count: booking.session_history.length,
    has_sessions: booking.session_history.length > 0,
    active_session_data: booking.active_session,
    session_history_sample: booking.session_history.slice(0, 2)
  });

  return booking;
}
  // Add helper methods:
  static async getPetById(petId) {
    const query = `SELECT * FROM pets WHERE id = ?`;
    const [rows] = await db.execute(query, [petId]);
    return rows[0];
  }

  static async getServiceById(serviceId) {
    const query = `SELECT * FROM grooming_services WHERE id = ?`;
    const [rows] = await db.execute(query, [serviceId]);
    return rows[0];
  }
  // Create walk-in booking
  static async createWalkInBooking(bookingData) {
    const {
      pet_id,
      owner_id,
      service_id,
      groomer_id,
      base_price,
      matted_coat_fee,
      total_amount,
      special_notes,
      queue_number,
      time_slot,
      payment_method,
      payment_status
    } = bookingData;

    const query = `
      INSERT INTO walk_in_bookings 
      (pet_id, owner_id, service_id, groomer_id, base_price, matted_coat_fee, 
       total_amount, special_notes, queue_number, time_slot, payment_method, payment_status, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `;

    const [result] = await db.execute(query, [
      pet_id, owner_id, service_id, groomer_id, base_price, matted_coat_fee,
      total_amount, special_notes, queue_number, time_slot, payment_method, payment_status
    ]);

    return result.insertId;
  }
  static async updateBookingPhotos(bookingId, photoData) {
    const fields = [];
    const values = [];

    // Use correct column names from database schema
    if (photoData.before_photo_url) {
      fields.push('before_photo = ?');
      values.push(photoData.before_photo_url);
    }

    if (photoData.after_photo_url) {
      fields.push('after_photo = ?');
      values.push(photoData.after_photo_url);
    }

    if (fields.length === 0) return false;

    fields.push('has_photos = 1');
    fields.push('photos_uploaded_at = NOW()');
    fields.push('updated_at = NOW()');
    values.push(bookingId);

    const query = `
      UPDATE walk_in_bookings 
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    const [result] = await db.execute(query, values);
    return result.affectedRows > 0;
  }

  // Get walk-in booking details
  static async getWalkInBookingById(bookingId) {
    const query = `
      SELECT wb.*, 
             u.name as owner_name, u.contact_number as owner_contact, u.email as owner_email,
             p.name as pet_name, p.breed, p.type, p.size, p.gender,
             gs.name as service_name, gs.description as service_description,
             g.name as groomer_name, g.profile_photo_url as groomer_photo_url
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN grooming_services gs ON wb.service_id = gs.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE wb.id = ?
    `;
    const [rows] = await db.execute(query, [bookingId]);
    return rows[0];
  }

  // Get next queue number
  static async getNextQueueNumber() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT COALESCE(MAX(queue_number), 0) + 1 as next_queue
      FROM walk_in_bookings 
      WHERE DATE(created_at) = ?
    `;
    const [rows] = await db.execute(query, [today]);
    return rows[0].next_queue;
  }

  // Get today's walk-in bookings
  static async getTodayWalkInBookings() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT wb.*, 
             u.name as owner_name, u.contact_number as owner_contact,
             p.name as pet_name, p.breed, p.type, p.size,
             gs.name as service_name,
             g.name as groomer_name
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN grooming_services gs ON wb.service_id = gs.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE DATE(wb.created_at) = ?
      ORDER BY wb.queue_number ASC, wb.created_at ASC
    `;
    const [rows] = await db.execute(query, [today]);
    return rows;
  }
  // This method now returns TODAY's active appointments only (both regular appointments and walk-ins)

  static async getActiveAppointments() {
    const today = new Date().toISOString().split('T')[0];

    const query = `
    SELECT 
      a.id,
      a.pet_id,
      a.status,
      a.preferred_date,
      a.preferred_time,
      p.name as pet_name,
      gs.name as service_name,
      'appointment' as booking_type
    FROM appointments a
    JOIN pets p ON a.pet_id = p.id
    JOIN grooming_services gs ON a.service_id = gs.id
    WHERE a.status IN ('pending', 'confirmed', 'in_progress')
    AND a.preferred_date = ?  -- Only TODAY's appointments
    
    UNION ALL
    
    SELECT 
      wb.id,
      wb.pet_id,
      wb.status,
      DATE(wb.created_at) as preferred_date,
      wb.time_slot as preferred_time,
      p.name as pet_name,
      gs.name as service_name,
      'walk_in' as booking_type
    FROM walk_in_bookings wb
    JOIN pets p ON wb.pet_id = p.id
    JOIN grooming_services gs ON wb.service_id = gs.id
    WHERE wb.status IN ('pending', 'in_progress')
    AND DATE(wb.created_at) = ?  -- Only TODAY's walk-ins
    
    ORDER BY preferred_date, preferred_time
  `;

    const [rows] = await db.execute(query, [today, today]);
    return rows;
  }

  // Add this method to WalkInBooking class:
  static async getBookedTimeSlotsForDay(date) {
    const query = `
    SELECT DISTINCT preferred_time as time_slot
    FROM appointments 
    WHERE preferred_date = ?
    AND status IN ('pending', 'confirmed', 'in_progress')
    
    UNION
    
    SELECT DISTINCT time_slot
    FROM walk_in_bookings 
    WHERE DATE(created_at) = ?
    AND status IN ('pending', 'in_progress')
  `;

    const [rows] = await db.execute(query, [date, date]);
    return rows.map(row => {
      const timeString = row.time_slot;
      // Convert to 12-hour format if needed
      if (timeString && !timeString.includes('AM') && !timeString.includes('PM')) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minutes} ${ampm}`;
      }
      return timeString;
    });
  }
  // Add to WalkInBooking class
  static async rescheduleWalkInTimeSlot(bookingId, newTimeSlot, rescheduleReason) {
    const query = `
    UPDATE walk_in_bookings 
    SET time_slot = ?, 
        reschedule_reason = ?,
        updated_at = NOW()
    WHERE id = ? 
    AND status IN ('pending', 'in_progress')
    AND DATE(created_at) = CURDATE()
  `;
    const [result] = await db.execute(query, [newTimeSlot, rescheduleReason, bookingId]);
    return result.affectedRows > 0;
  }

  // Update booking groomer
  static async updateBookingGroomer(bookingId, groomerId, changeReason = null) {
    const query = `
    UPDATE walk_in_bookings 
    SET groomer_id = ?, 
        groomer_change_reason = ?,
        updated_at = NOW()
    WHERE id = ?
  `;
    const [result] = await db.execute(query, [groomerId, changeReason, bookingId]);
    return result.affectedRows > 0;
  }

  // Add this method to WalkInBooking class
  static async updateBookingStatus(bookingId, status) {
    const query = `
    UPDATE walk_in_bookings 
    SET status = ?, updated_at = NOW()
    WHERE id = ?
  `;
    const [result] = await db.execute(query, [status, bookingId]);
    return result.affectedRows > 0;
  }

  // Also add the getTodayStats method that's being called
  static async getTodayStats() {
    const today = new Date().toISOString().split('T')[0];
    const query = `
    SELECT 
      COUNT(*) as total_bookings,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
      COALESCE(MAX(queue_number), 0) as current_queue_number
    FROM walk_in_bookings 
    WHERE DATE(created_at) = ?
  `;
    const [rows] = await db.execute(query, [today]);
    return rows[0];
  }

  static async getYesterdayWalkInBookingsWithServices() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const query = `
      SELECT wb.*, 
             u.name as owner_name, u.contact_number as owner_contact,
             u.profile_photo_url as owner_photo_url,
             p.name as pet_name, p.breed, p.type, p.size, p.photo_url as pet_photo_url,
             g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
             CASE WHEN wb.before_photo IS NOT NULL OR wb.after_photo IS NOT NULL 
                  THEN 1 ELSE 0 END as has_photos
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE DATE(wb.created_at) = ? AND wb.status = 'completed'
      ORDER BY wb.queue_number ASC, wb.created_at ASC
    `;
    const [rows] = await db.execute(query, [yesterdayStr]);
  
    // Get services and session data for each booking
    for (let booking of rows) {
      // Get services for this booking
      const servicesQuery = `
        SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
        FROM walk_in_booking_services wbs
        JOIN grooming_services gs ON wbs.service_id = gs.id
        WHERE wbs.walk_in_booking_id = ?
        ORDER BY wbs.is_addon ASC, wbs.id ASC
      `;
      const [serviceRows] = await db.execute(servicesQuery, [booking.id]);
      booking.services = serviceRows;
  
      // Map photo URLs for frontend consistency
      booking.before_photo_url = booking.before_photo;
      booking.after_photo_url = booking.after_photo;
      booking.has_before_photo = !!booking.before_photo;
      booking.has_after_photo = !!booking.after_photo;
  
      // For backward compatibility, set service_name to first service
      booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';
  
      // Get payment history for this booking
      const paymentQuery = `
        SELECT payment_method, amount, payment_type, service_ids, created_at
        FROM walk_in_booking_payments
        WHERE walk_in_booking_id = ?
        ORDER BY created_at ASC
      `;
      const [paymentRows] = await db.execute(paymentQuery, [booking.id]);
      booking.payment_history = paymentRows.map(payment => ({
        ...payment,
        service_ids: payment.service_ids ? JSON.parse(payment.service_ids) : []
      }));
  
      // Get completed session history
      const sessionHistoryQuery = `
        SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
               gs.end_time, gs.duration_minutes, gs.status, gs.notes,
               u.name as groomer_name
        FROM grooming_sessions gs
        JOIN users u ON gs.groomer_id = u.id
        WHERE gs.walk_in_booking_id = ? AND gs.status = 'completed'
        ORDER BY gs.start_time DESC
      `;
      const [historyRows] = await db.execute(sessionHistoryQuery, [booking.id]);
      booking.session_history = historyRows;
      booking.active_session = null; // Yesterday bookings should not have active sessions
    }
  
    return rows;
  }
  
  
  static async getHistoryWalkInBookingsWithServices() {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT wb.*, 
             u.name as owner_name, u.contact_number as owner_contact,
             u.profile_photo_url as owner_photo_url,
             p.name as pet_name, p.breed, p.type, p.size, p.photo_url as pet_photo_url,
             g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
             CASE WHEN wb.before_photo IS NOT NULL OR wb.after_photo IS NOT NULL 
                  THEN 1 ELSE 0 END as has_photos
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE DATE(wb.created_at) < ? 
      AND wb.status IN ('pending', 'in_progress', 'completed', 'cancelled')
      ORDER BY wb.created_at DESC
    `;
    const [rows] = await db.execute(query, [today]);
  
    // Get services and session data for each booking
    for (let booking of rows) {
      // Get services for this booking
      const servicesQuery = `
        SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
        FROM walk_in_booking_services wbs
        JOIN grooming_services gs ON wbs.service_id = gs.id
        WHERE wbs.walk_in_booking_id = ?
        ORDER BY wbs.is_addon ASC, wbs.id ASC
      `;
      const [serviceRows] = await db.execute(servicesQuery, [booking.id]);
      booking.services = serviceRows;
  
      // Map photo URLs for frontend consistency
      booking.before_photo_url = booking.before_photo;
      booking.after_photo_url = booking.after_photo;
      booking.has_before_photo = !!booking.before_photo;
      booking.has_after_photo = !!booking.after_photo;
  
      // For backward compatibility, set service_name to first service
      booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';
  
      // Get payment history for this booking
      const paymentQuery = `
        SELECT payment_method, amount, payment_type, service_ids, created_at
        FROM walk_in_booking_payments
        WHERE walk_in_booking_id = ?
        ORDER BY created_at ASC
      `;
      const [paymentRows] = await db.execute(paymentQuery, [booking.id]);
      booking.payment_history = paymentRows.map(payment => ({
        ...payment,
        service_ids: payment.service_ids ? JSON.parse(payment.service_ids) : []
      }));
  
      // Get completed session history
      const sessionHistoryQuery = `
        SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
               gs.end_time, gs.duration_minutes, gs.status, gs.notes,
               u.name as groomer_name
        FROM grooming_sessions gs
        JOIN users u ON gs.groomer_id = u.id
        WHERE gs.walk_in_booking_id = ? AND gs.status = 'completed'
        ORDER BY gs.start_time DESC
      `;
      const [historyRows] = await db.execute(sessionHistoryQuery, [booking.id]);
      booking.session_history = historyRows;
      booking.active_session = null; // History bookings should not have active sessions
    }
  
    return rows;
  }

  static async cancelWalkInBooking(bookingId, cancellationData) {
    console.log('=== MODEL: Cancel Walk-In Booking ===');
    console.log('Booking ID:', bookingId);
    console.log('Cancellation data:', cancellationData);
    
    const { cancellation_reason, cancelled_by, refund_eligible } = cancellationData;
    
    // First, check if booking exists and get current status
    const checkQuery = `
      SELECT id, status, created_at, DATE(created_at) as booking_date, CURDATE() as today
      FROM walk_in_bookings 
      WHERE id = ?
    `;
    
    const [checkResult] = await db.execute(checkQuery, [bookingId]);
    console.log('Booking check result:', checkResult);
    
    if (checkResult.length === 0) {
      console.log('❌ Booking not found');
      return false;
    }
    
    const booking = checkResult[0];
    console.log('Current booking status:', booking.status);
    console.log('Booking date:', booking.booking_date);
    console.log('Today:', booking.today);
    console.log('Is today?', booking.booking_date === booking.today);
    console.log('Status valid?', ['pending', 'in_progress'].includes(booking.status));
    
    const query = `
      UPDATE walk_in_bookings 
      SET status = 'cancelled', 
          cancellation_reason = ?,
          cancelled_by = ?,
          refund_eligible = ?,
          updated_at = NOW()
      WHERE id = ? 
      AND status IN ('pending', 'in_progress')
      AND DATE(created_at) = CURDATE()
    `;
    
    console.log('Executing update query with params:', [
      cancellation_reason, 
      cancelled_by, 
      refund_eligible, 
      bookingId
    ]);
    
    const [result] = await db.execute(query, [
      cancellation_reason, 
      cancelled_by, 
      refund_eligible, 
      bookingId
    ]);
    
    console.log('Update result:', result);
    console.log('Affected rows:', result.affectedRows);
    
    return result.affectedRows > 0;
  }

// Add these methods to your WalkInBooking class in models/WalkInBooking.js

// Start a grooming session
static async startGroomingSession(bookingId, groomerId) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    // Create new session with explicit start time
    const sessionQuery = `
      INSERT INTO grooming_sessions (walk_in_booking_id, groomer_id, start_time, status)
      VALUES (?, ?, NOW(), 'active')
    `;
    const [sessionResult] = await connection.execute(sessionQuery, [bookingId, groomerId]);
    const sessionId = sessionResult.insertId;

    // Update booking status and link session
    const updateBookingQuery = `UPDATE walk_in_bookings SET status = 'in_progress', updated_at = NOW() WHERE id = ?`;
    await connection.execute(updateBookingQuery, [bookingId]);

    await connection.commit();
    return { sessionId, startTime: new Date() };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// End a grooming session// In WalkInBooking.js - Fix endGroomingSession method
static async endGroomingSession(bookingId) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

    // Get the ACTIVE session (not via session_id from booking table)
    const sessionQuery = `
      SELECT gs.id, gs.start_time 
      FROM grooming_sessions gs
      WHERE gs.walk_in_booking_id = ? AND gs.status = 'active'
      ORDER BY gs.start_time DESC
      LIMIT 1
    `;
    const [sessionRows] = await connection.execute(sessionQuery, [bookingId]);
    
    if (sessionRows.length === 0) {
      throw new Error('No active session found for this booking');
    }

    const session = sessionRows[0];
    const startTime = new Date(session.start_time);
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

    // Update session with end time and duration
    const updateSessionQuery = `
      UPDATE grooming_sessions 
      SET end_time = ?, duration_minutes = ?, status = 'completed'
      WHERE id = ?
    `;
    await connection.execute(updateSessionQuery, [endTime, durationMinutes, session.id]);

    // Update booking status to completed
    const updateBookingQuery = `
      UPDATE walk_in_bookings 
      SET status = 'completed', updated_at = NOW()
      WHERE id = ?
    `;
    await connection.execute(updateBookingQuery, [bookingId]);

    await connection.commit();
    
    return {
      sessionId: session.id,
      startTime,
      endTime,
      durationMinutes
    };

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Get active session for booking
static async getActiveSession(bookingId) {
  const query = `
    SELECT gs.*, u.name as groomer_name
    FROM grooming_sessions gs
    JOIN walk_in_bookings wb ON gs.id = wb.session_id
    JOIN users u ON gs.groomer_id = u.id
    WHERE wb.id = ? AND gs.status = 'active'
  `;
  const [rows] = await db.execute(query, [bookingId]);
  return rows[0] || null;
}

// Get session history for booking
static async getSessionHistory(bookingId) {
  const query = `
    SELECT gs.*, u.name as groomer_name
    FROM grooming_sessions gs
    JOIN walk_in_bookings wb ON gs.id = wb.session_id
    JOIN users u ON gs.groomer_id = u.id
    WHERE wb.id = ?
    ORDER BY gs.start_time DESC
  `;
  const [rows] = await db.execute(query, [bookingId]);
  return rows;
}


  // ============= CUSTOMER-SPECIFIC METHODS =============

  // Get customer's walk-in bookings (today's active + recent history)
  static async getCustomerWalkInBookings(customerId) {
    const query = `
    SELECT wb.*, 
          u.name as owner_name, u.contact_number as owner_contact, u.email as owner_email,
          u.profile_photo_url as owner_photo_url,
          p.name as pet_name, p.breed, p.type, p.size, p.photo_url as pet_photo_url,
          g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
          CASE WHEN wb.before_photo IS NOT NULL OR wb.after_photo IS NOT NULL 
                THEN 1 ELSE 0 END as has_photos,
          DATE(wb.created_at) as booking_date,
          wr.rating,
          CASE WHEN wr.id IS NOT NULL THEN 1 ELSE 0 END as has_rating
    FROM walk_in_bookings wb
    JOIN users u ON wb.owner_id = u.id
    JOIN pets p ON wb.pet_id = p.id
    JOIN users g ON wb.groomer_id = g.id
    LEFT JOIN walk_in_ratings wr ON wb.id = wr.walk_in_booking_id
    WHERE wb.owner_id = ?
    ORDER BY wb.created_at DESC, wb.queue_number ASC
  `;
  const [rows] = await db.execute(query, [customerId]);

    // Get services and session data for each booking
    for (let booking of rows) {
      // Get services for this booking
      const servicesQuery = `
        SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
        FROM walk_in_booking_services wbs
        JOIN grooming_services gs ON wbs.service_id = gs.id
        WHERE wbs.walk_in_booking_id = ?
        ORDER BY wbs.is_addon ASC, wbs.id ASC
      `;
      const [serviceRows] = await db.execute(servicesQuery, [booking.id]);
      booking.services = serviceRows;

      // Map photo URLs for frontend consistency
      booking.before_photo_url = booking.before_photo;
      booking.after_photo_url = booking.after_photo;
      booking.has_before_photo = !!booking.before_photo;
      booking.has_after_photo = !!booking.after_photo;

      // For backward compatibility, set service_name to first service
      booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';

      // Get payment history for this booking
      const paymentQuery = `
        SELECT payment_method, amount, payment_type, service_ids, created_at
        FROM walk_in_booking_payments
        WHERE walk_in_booking_id = ?
        ORDER BY created_at ASC
      `;
      const [paymentRows] = await db.execute(paymentQuery, [booking.id]);
      booking.payment_history = paymentRows.map(payment => ({
        ...payment,
        service_ids: payment.service_ids ? JSON.parse(payment.service_ids) : []
      }));

      // Add active session data for in-progress bookings
      if (booking.status === 'in_progress') {
        const activeSessionQuery = `
          SELECT gs.id, gs.start_time, gs.groomer_id, gs.status, gs.notes,
                u.name as groomer_name
          FROM grooming_sessions gs
          JOIN users u ON gs.groomer_id = u.id
          WHERE gs.walk_in_booking_id = ? AND gs.status = 'active'
          ORDER BY gs.start_time DESC
          LIMIT 1
        `;
        const [sessionRows] = await db.execute(activeSessionQuery, [booking.id]);
        booking.active_session = sessionRows[0] || null;
      } else {
        booking.active_session = null;
      }

      // Get completed session history
      const sessionHistoryQuery = `
        SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
              gs.end_time, gs.duration_minutes, gs.status, gs.notes,
              u.name as groomer_name
        FROM grooming_sessions gs
        JOIN users u ON gs.groomer_id = u.id
        WHERE gs.walk_in_booking_id = ? AND gs.status = 'completed'
        ORDER BY gs.start_time DESC
      `;
      const [historyRows] = await db.execute(sessionHistoryQuery, [booking.id]);
      booking.session_history = historyRows;
    }

    return rows;
  }

  // Get specific customer walk-in booking by ID (with ownership verification)
  static async getCustomerWalkInBookingById(bookingId, customerId) {
    const query = `
      SELECT wb.*, 
            u.name as owner_name, u.contact_number as owner_contact, u.email as owner_email,
            p.name as pet_name, p.breed, p.type, p.size, p.gender,
            g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
            DATE(wb.created_at) as booking_date
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE wb.id = ? AND wb.owner_id = ?
    `;
    const [rows] = await db.execute(query, [bookingId, customerId]);

    if (rows.length === 0) {
      return null;
    }

    const booking = rows[0];

    // Get services for this booking
    const servicesQuery = `
      SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
      FROM walk_in_booking_services wbs
      JOIN grooming_services gs ON wbs.service_id = gs.id
      WHERE wbs.walk_in_booking_id = ?
      ORDER BY wbs.is_addon ASC, wbs.id ASC
    `;
    const [serviceRows] = await db.execute(servicesQuery, [bookingId]);
    booking.services = serviceRows;

    // Get payment history
    const paymentQuery = `
      SELECT payment_method, amount, payment_type, service_ids, created_at
      FROM walk_in_booking_payments
      WHERE walk_in_booking_id = ?
      ORDER BY created_at ASC
    `;
    const [paymentRows] = await db.execute(paymentQuery, [bookingId]);
    booking.payment_history = paymentRows.map(payment => ({
      ...payment,
      service_ids: payment.service_ids ? JSON.parse(payment.service_ids) : []
    }));

    // Add active session data
    if (booking.status === 'in_progress') {
      const activeSessionQuery = `
        SELECT gs.id, gs.start_time, gs.groomer_id, gs.status, gs.notes,
              u.name as groomer_name
        FROM grooming_sessions gs
        JOIN users u ON gs.groomer_id = u.id
        WHERE gs.walk_in_booking_id = ? AND gs.status = 'active'
        ORDER BY gs.start_time DESC
        LIMIT 1
      `;
      const [sessionRows] = await db.execute(activeSessionQuery, [bookingId]);
      booking.active_session = sessionRows[0] || null;
    } else {
      booking.active_session = null;
    }

    // Get session history
    const sessionHistoryQuery = `
      SELECT gs.id, gs.walk_in_booking_id, gs.groomer_id, gs.start_time, 
            gs.end_time, gs.duration_minutes, gs.status, gs.notes,
            u.name as groomer_name
      FROM grooming_sessions gs
      JOIN users u ON gs.groomer_id = u.id
      WHERE gs.walk_in_booking_id = ? AND gs.status = 'completed'
      ORDER BY gs.start_time DESC
    `;
    const [historyRows] = await db.execute(sessionHistoryQuery, [bookingId]);
    booking.session_history = historyRows;

    // Add photo information
    booking.has_before_photo = !!booking.before_photo;
    booking.has_after_photo = !!booking.after_photo;
    booking.has_photos = booking.has_before_photo || booking.has_after_photo;
    booking.before_photo_url = booking.before_photo;
    booking.after_photo_url = booking.after_photo;
    booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';

    // ✅ Add rating data

const ratingQuery = `
SELECT rating, review, 
       staff_friendliness as staff_rating,
       service_quality as service_rating, 
       cleanliness as cleanliness_rating,
       value_for_money as value_rating,
       created_at
FROM walk_in_ratings
WHERE walk_in_booking_id = ?
`;
const [ratingRows] = await db.execute(ratingQuery, [bookingId]);
booking.rating_data = ratingRows[0] || null;
booking.has_rating = !!ratingRows[0];

    return booking;
}

  // Get customer's today walk-in bookings only
  static async getCustomerTodayWalkInBookings(customerId) {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT wb.*, 
            u.name as owner_name, u.contact_number as owner_contact, u.email as owner_email,
            p.name as pet_name, p.breed, p.type, p.size, p.photo_url as pet_photo_url,
            g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
            CASE WHEN wb.before_photo IS NOT NULL OR wb.after_photo IS NOT NULL 
                  THEN 1 ELSE 0 END as has_photos
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE wb.owner_id = ? AND DATE(wb.created_at) = ?
      ORDER BY wb.queue_number ASC, wb.created_at ASC
    `;
    const [rows] = await db.execute(query, [customerId, today]);

    // Get services for each booking
    for (let booking of rows) {
      const servicesQuery = `
        SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
        FROM walk_in_booking_services wbs
        JOIN grooming_services gs ON wbs.service_id = gs.id
        WHERE wbs.walk_in_booking_id = ?
        ORDER BY wbs.is_addon ASC, wbs.id ASC
      `;
      const [serviceRows] = await db.execute(servicesQuery, [booking.id]);
      booking.services = serviceRows;
      booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';

      // Add photo information
      booking.before_photo_url = booking.before_photo;
      booking.after_photo_url = booking.after_photo;
      booking.has_before_photo = !!booking.before_photo;
      booking.has_after_photo = !!booking.after_photo;

      // Add session info for in-progress bookings
      if (booking.status === 'in_progress') {
        const activeSessionQuery = `
          SELECT gs.id, gs.start_time, gs.groomer_id, gs.status,
                u.name as groomer_name
          FROM grooming_sessions gs
          JOIN users u ON gs.groomer_id = u.id
          WHERE gs.walk_in_booking_id = ? AND gs.status = 'active'
          LIMIT 1
        `;
        const [sessionRows] = await db.execute(activeSessionQuery, [booking.id]);
        booking.active_session = sessionRows[0] || null;
      }
    }

    return rows;
  }

  // Get customer's walk-in booking history with pagination
  static async getCustomerWalkInBookingHistory(customerId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM walk_in_bookings wb
      WHERE wb.owner_id = ? 
      AND DATE(wb.created_at) < CURDATE()
    `;
    const [countRows] = await db.execute(countQuery, [customerId]);
    const totalRecords = countRows[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Get paginated bookings
    const query = `
      SELECT wb.*, 
            u.name as owner_name, u.contact_number as owner_contact,
            p.name as pet_name, p.breed, p.type, p.size, p.photo_url as pet_photo_url,
            g.name as groomer_name, g.profile_photo_url as groomer_photo_url,
            CASE WHEN wb.before_photo IS NOT NULL OR wb.after_photo IS NOT NULL 
                  THEN 1 ELSE 0 END as has_photos,
            DATE(wb.created_at) as booking_date
      FROM walk_in_bookings wb
      JOIN users u ON wb.owner_id = u.id
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      WHERE wb.owner_id = ? 
      AND DATE(wb.created_at) < CURDATE()
      ORDER BY wb.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.execute(query, [customerId, limit, offset]);

    // Get services for each booking
    for (let booking of rows) {
      const servicesQuery = `
        SELECT wbs.price, wbs.is_addon, gs.id, gs.name, gs.description
        FROM walk_in_booking_services wbs
        JOIN grooming_services gs ON wbs.service_id = gs.id
        WHERE wbs.walk_in_booking_id = ?
        ORDER BY wbs.is_addon ASC, wbs.id ASC
      `;
      const [serviceRows] = await db.execute(servicesQuery, [booking.id]);
      booking.services = serviceRows;
      booking.service_name = serviceRows.length > 0 ? serviceRows[0].name : 'No Service';

      // Add photo information
      booking.before_photo_url = booking.before_photo;
      booking.after_photo_url = booking.after_photo;
      booking.has_before_photo = !!booking.before_photo;
      booking.has_after_photo = !!booking.after_photo;
    }

    return {
      bookings: rows,
      currentPage: page,
      totalPages: totalPages,
      totalRecords: totalRecords,
      hasMore: page < totalPages
    };
  }

  // Get customer's pets
  static async getCustomerPets(customerId) {
    const query = `
      SELECT id, name, breed, type, gender, size, weight, age, photo_url
      FROM pets 
      WHERE user_id = ?
      ORDER BY name ASC
    `;
    const [rows] = await db.execute(query, [customerId]);
    return rows;
  }

  // Get customer's active walk-in booking (today only)
  static async getCustomerActiveWalkInBooking(customerId) {
    const today = new Date().toISOString().split('T')[0];
    const query = `
      SELECT wb.*, 
            p.name as pet_name, p.breed, p.type, p.size,
            g.name as groomer_name,
            gs.name as service_name
      FROM walk_in_bookings wb
      JOIN pets p ON wb.pet_id = p.id
      JOIN users g ON wb.groomer_id = g.id
      JOIN grooming_services gs ON wb.service_id = gs.id
      WHERE wb.owner_id = ? 
      AND DATE(wb.created_at) = ?
      AND wb.status IN ('pending', 'in_progress')
      ORDER BY wb.created_at DESC
      LIMIT 1
    `;
    const [rows] = await db.execute(query, [customerId, today]);
    return rows[0] || null;
  }

  // Get customer's walk-in statistics
// Get customer's walk-in statistics
static async getCustomerWalkInStats(customerId) {
  const query = `
    SELECT 
      COUNT(*) as total_walk_in_bookings,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
      COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_bookings,
      COUNT(CASE WHEN DATE(created_at) = CURDATE() AND status IN ('pending', 'in_progress') THEN 1 END) as active_today,
      COUNT(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as last_30_days,
      -- Calculate total spent from COMPLETED bookings (base + addons + matted coat fees)
      COALESCE(
        (SELECT SUM(
           COALESCE(wb.base_price, 0) + 
           COALESCE(wb.matted_coat_fee, 0) +
           COALESCE(addon_costs.addon_total, 0)
         )
         FROM walk_in_bookings wb 
         LEFT JOIN (
           SELECT 
             wbs.walk_in_booking_id,
             SUM(CASE WHEN wbs.is_addon = 1 THEN wbs.price ELSE 0 END) as addon_total
           FROM walk_in_booking_services wbs
           GROUP BY wbs.walk_in_booking_id
         ) addon_costs ON wb.id = addon_costs.walk_in_booking_id
         WHERE wb.owner_id = ? AND wb.status = 'completed'), 0
      ) as total_spent,
      -- Alternative: Use the final total_amount from COMPLETED bookings only
      COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_amount_sum,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN total_amount END), 0) as average_spending
    FROM walk_in_bookings 
    WHERE owner_id = ?
  `;
  const [rows] = await db.execute(query, [customerId, customerId]);
  
  const stats = rows[0];
  
  // Convert decimal values to numbers
  stats.total_spent = parseFloat(stats.total_spent) || 0;
  stats.average_spending = parseFloat(stats.average_spending) || 0;
  
  return stats;
}

// Submit walk-in rating
static async submitWalkInRating(ratingData) {
  const {
    walk_in_booking_id,
    customer_id,
    rating,
    review,
    staff_friendliness,
    service_quality,
    cleanliness,
    value_for_money
  } = ratingData;

  const query = `
    INSERT INTO walk_in_ratings 
    (walk_in_booking_id, customer_id, rating, review, staff_friendliness, 
     service_quality, cleanliness, value_for_money, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const [result] = await db.execute(query, [
    walk_in_booking_id,
    customer_id,
    rating,
    review,
    staff_friendliness,
    service_quality,
    cleanliness,
    value_for_money
  ]);

  return result.insertId;
}

// Check if rating exists for booking
static async getWalkInRating(bookingId) {
  const query = `
    SELECT * FROM walk_in_ratings 
    WHERE walk_in_booking_id = ?
  `;
  const [rows] = await db.execute(query, [bookingId]);
  return rows[0] || null;
}

// Get rating with customer details
static async getWalkInRatingWithDetails(bookingId) {
  const query = `
    SELECT wr.*, u.name as customer_name
    FROM walk_in_ratings wr
    JOIN users u ON wr.customer_id = u.id
    WHERE wr.walk_in_booking_id = ?
  `;
  const [rows] = await db.execute(query, [bookingId]);
  return rows[0] || null;
}

// Get all walk-in ratings with booking and customer details
static async getAllWalkInRatings(page = 1, limit = 20, filters = {}) {
  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE 1=1';
  let queryParams = [];
  
  // Add filters if provided
  if (filters.rating) {
    whereClause += ' AND wr.rating = ?';
    queryParams.push(filters.rating);
  }
  
  if (filters.dateFrom) {
    whereClause += ' AND DATE(wr.created_at) >= ?';
    queryParams.push(filters.dateFrom);
  }
  
  if (filters.dateTo) {
    whereClause += ' AND DATE(wr.created_at) <= ?';
    queryParams.push(filters.dateTo);
  }

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM walk_in_ratings wr
    JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
    JOIN users u ON wr.customer_id = u.id
    JOIN pets p ON wb.pet_id = p.id
    JOIN users g ON wb.groomer_id = g.id
    ${whereClause}
  `;
  
  const [countRows] = await db.execute(countQuery, queryParams);
  const totalRecords = countRows[0].total;
  const totalPages = Math.ceil(totalRecords / limit);

  // Get ratings with details
  const query = `
    SELECT 
      wr.id as rating_id,
      wr.rating,
      wr.review,
      wr.staff_friendliness,
      wr.service_quality,
      wr.cleanliness,
      wr.value_for_money,
      wr.created_at as rated_at,
      wb.id as booking_id,
      wb.queue_number,
      wb.total_amount,
      wb.status as booking_status,
      wb.created_at as booking_date,
      u.name as customer_name,
      u.contact_number as customer_contact,
      p.name as pet_name,
      p.breed,
      p.type,
      g.name as groomer_name,
      COALESCE(
        (SELECT GROUP_CONCAT(gs.name SEPARATOR ', ') 
         FROM walk_in_booking_services wbs 
         JOIN grooming_services gs ON wbs.service_id = gs.id 
         WHERE wbs.walk_in_booking_id = wb.id), 
        'No Service'
      ) as services_names
    FROM walk_in_ratings wr
    JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
    JOIN users u ON wr.customer_id = u.id
    JOIN pets p ON wb.pet_id = p.id
    JOIN users g ON wb.groomer_id = g.id
    ${whereClause}
    ORDER BY wr.created_at DESC
    LIMIT ? OFFSET ?
  `;
  
  queryParams.push(limit, offset);
  const [rows] = await db.execute(query, queryParams);

  return {
    ratings: rows,
    currentPage: page,
    totalPages: totalPages,
    totalRecords: totalRecords,
    hasMore: page < totalPages
  };
}

// Get rating statistics
static async getWalkInRatingStats() {
  const query = `
    SELECT 
      COUNT(*) as total_ratings,
      AVG(rating) as average_rating,
      COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
      COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
      COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
      COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
      COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star,
      COUNT(CASE WHEN review IS NOT NULL AND review != '' THEN 1 END) as with_reviews,
      COUNT(CASE WHEN staff_friendliness > 0 THEN 1 END) as with_aspect_ratings
    FROM walk_in_ratings
  `;
  
  const [rows] = await db.execute(query);
  const stats = rows[0];
  
  // Calculate percentages
  const total = parseInt(stats.total_ratings);
  if (total > 0) {
    stats.rating_distribution = {
      5: Math.round((stats.five_star / total) * 100),
      4: Math.round((stats.four_star / total) * 100),
      3: Math.round((stats.three_star / total) * 100),
      2: Math.round((stats.two_star / total) * 100),
      1: Math.round((stats.one_star / total) * 100)
    };
  } else {
    stats.rating_distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  }
  
  stats.average_rating = parseFloat(stats.average_rating).toFixed(1);
  
  return stats;
}

  }

  module.exports = WalkInBooking;