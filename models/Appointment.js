// models/Appointment.js -
const db = require('./db');

class Appointment {
  static async create(appointmentData) {
    // Validate required fields
    const requiredFields = [
      'pet_id', 'owner_id', 'service_id', 'preferred_date',
      'preferred_time', 'base_price', 'total_amount'
    ];

    const missingFields = requiredFields.filter(field => !appointmentData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    try {
      // Convert 12-hour time to 24-hour for database storage
      const preferred_time_24h = this.convertTo24Hour(appointmentData.preferred_time);

      const sql = `
            INSERT INTO appointments 
            (pet_id, owner_id, service_id, preferred_date, preferred_time, 
            base_price, matted_coat_fee, total_amount, special_notes, status, payment_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
        `;

      const [result] = await db.query(sql, [
        appointmentData.pet_id,
        appointmentData.owner_id,
        appointmentData.service_id,
        appointmentData.preferred_date,
        preferred_time_24h, // Using converted 24-hour format
        appointmentData.base_price,
        appointmentData.matted_coat_fee || 0,
        appointmentData.total_amount,
        appointmentData.special_notes || null
      ]);

      console.log('Appointment created with time conversion:', {
        input_time: appointmentData.preferred_time,
        stored_time: preferred_time_24h,
        appointment_id: result.insertId
      });

      return result.insertId;

    } catch (error) {
      console.error('Error creating appointment:', {
        error: error.message,
        appointmentData: {
          ...appointmentData,
          preferred_time: 'REDACTED' // Don't log full time in error messages
        }
      });
      throw error;
    }
  }


  static async findByIdWithPetDetails(id) {
    try {
      // VALIDATE INPUT PARAMETER
      if (!id || id === undefined || id === null) {
        console.error('Invalid appointment ID provided:', id);
        return null;
      }

      console.log(`Fetching appointment with ID: ${id}`);

      const [appointmentRows] = await db.execute(`
      SELECT 
          a.*,
          u.name as owner_name,
          u.email as owner_email, 
          u.contact_number as owner_contact,
          u.profile_photo_url as owner_profile_photo,
          p.name as pet_name,
          p.breed as pet_breed,
          p.size as pet_size,
          p.age as pet_age,
          p.weight as pet_weight,
          p.photo_url as pet_photo,
          p.type as pet_species,
          p.gender as pet_gender,
          gs.name as service_name,
          gs.category as service_category,
          gs.description as service_description,
          gs.image_url as service_image,
          groomer.name as groomer_name,
          groomer.email as groomer_email,
          groomer.contact_number as groomer_contact,
          groomer.profile_photo_url as groomer_photo,
          a.cancelled_reason,
          a.cancelled_by_role,
          a.cancelled_by_user_id,
          a.cancelled_at,
          r.id as rating_id,
          r.rating as rating_score,
          r.review as rating_review,
          r.staff_rating,
          r.service_rating,
          r.cleanliness_rating,
          r.value_rating,
          r.created_at as rating_date,
          CASE 
              WHEN r.id IS NOT NULL THEN TRUE 
              ELSE FALSE 
          END as has_rating
      FROM appointments a
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users groomer ON a.groomer_id = groomer.id
      LEFT JOIN ratings r ON a.id = r.appointment_id  -- JOIN WITH RATINGS
      WHERE a.id = ?
    `, [id]);

      if (appointmentRows.length === 0) {
        console.log(`Appointment ${id} not found`);
        return null;
      }

      const appointment = appointmentRows[0];

      // FETCH ADDITIONAL SERVICES with proper validation
      const [additionalServicesRows] = await db.execute(`
        SELECT 
            aps.id as appointment_service_id,
            aps.service_id,
            aps.price as service_price,
            aps.payment_method,
            aps.created_at as service_added_at,
            gs.name as service_name,
            gs.description,
            gs.category,
            gs.image_url,
            gs.time_description
        FROM appointment_services aps
        JOIN grooming_services gs ON aps.service_id = gs.id
        WHERE aps.appointment_id = ?
        ORDER BY aps.created_at ASC
      `, [id]);


      // Format additional services
      const additional_services = additionalServicesRows.map(service => ({
        id: service.service_id,
        appointment_service_id: service.appointment_service_id,
        name: service.service_name,
        price: parseFloat(service.service_price || 0),
        payment_method: service.payment_method,
        category: service.category,
        description: service.description,
        image_url: service.image_url,
        time_description: service.time_description,
        added_at: service.service_added_at
      }));

      // Add session information query
      const [sessionRows] = await db.execute(`
SELECT 
  id as session_id,
  start_time,
  end_time,
  duration_minutes,
  status as session_status
FROM appointment_sessions 
WHERE appointment_id = ?
ORDER BY start_time DESC 
LIMIT 1
`, [id]);

      const sessionData = sessionRows.length > 0 ? {
        session_id: sessionRows[0].session_id,
        start_time: sessionRows[0].start_time,
        end_time: sessionRows[0].end_time,
        duration_minutes: sessionRows[0].duration_minutes,
        session_status: sessionRows[0].session_status
      } : null;

      const [rescheduleHistoryRows] = await db.execute(`
SELECT 
  arh.old_preferred_date,
  arh.old_preferred_time,
  arh.new_preferred_date,
  arh.new_preferred_time,
  arh.reason,
  arh.rescheduled_by_role,
  arh.rescheduled_at,
  arh.rescheduled_by_user_id,
  u.name as rescheduled_by_name,
  u.role as user_role,
  u.staff_type,
  CASE 
    WHEN u.id IS NOT NULL THEN u.name
    WHEN arh.rescheduled_by_role = 'owner' THEN 'Business Owner'
    WHEN arh.rescheduled_by_role = 'staff' THEN 'Staff Member'
    WHEN arh.rescheduled_by_role = 'pet_owner' THEN 'Customer'
    ELSE 'System'
  END as display_name,
  CASE 
    WHEN u.id IS NOT NULL THEN u.role
    ELSE arh.rescheduled_by_role
  END as display_role
FROM appointment_reschedule_history arh
LEFT JOIN users u ON arh.rescheduled_by_user_id = u.id
WHERE arh.appointment_id = ?
ORDER BY arh.rescheduled_at ASC
`, [id]);

      // ENHANCED reschedule_history mapping with better fallbacks:
      const reschedule_history = rescheduleHistoryRows.map(history => ({
        old_date: history.old_preferred_date,
        old_time: Appointment.convertTo12Hour(history.old_preferred_time),
        new_date: history.new_preferred_date,
        new_time: Appointment.convertTo12Hour(history.new_preferred_time),
        reason: history.reason || 'No reason provided',
        rescheduled_by: history.rescheduled_by_role,
        rescheduled_by_name: history.display_name, // Use enhanced display name
        rescheduled_by_role: history.display_role, // Use enhanced display role
        rescheduled_by_user_id: history.rescheduled_by_user_id,
        staff_type: history.staff_type,
        rescheduled_at: history.rescheduled_at,
        // ADD formatted display for UI
        display_text: `${history.display_name} (${history.display_role})`,
        has_user_data: Boolean(history.rescheduled_by_user_id)
      }));

      console.log(`Found ${reschedule_history.length} reschedule records for appointment ${id}`);

      // BUILD FORMATTED APPOINTMENT with proper null checks
      const formattedAppointment = {
        id: appointment.id,
        customer_id: appointment.owner_id,
        owner_id: appointment.owner_id,
        daily_queue_number: appointment.daily_queue_number || null,
        queue_date: appointment.queue_date || null,
        pet_id: appointment.pet_id,
        service_id: appointment.service_id,
        groomer_id: appointment.groomer_id,
        preferred_date: appointment.preferred_date,
        preferred_time: this.convertTo12Hour(appointment.preferred_time),
        actual_date: appointment.actual_date,
        actual_time: appointment.actual_time ? this.convertTo12Hour(appointment.actual_time) : null,
        status: appointment.status,
        base_price: parseFloat(appointment.base_price || 0),
        matted_coat_fee: parseFloat(appointment.matted_coat_fee || 0),
        total_amount: parseFloat(appointment.total_amount || 0),
        payment_status: appointment.payment_status,
        payment_method: appointment.payment_method,
        special_notes: appointment.special_notes,      
        session_data: sessionData,
        session_duration: sessionData?.duration_minutes || appointment.duration_minutes || null,
        duration_minutes: appointment.duration_minutes || null,
        created_at: appointment.created_at,
        updated_at: appointment.updated_at,
        cancelled_reason: appointment.cancelled_reason,
        cancelled_by_role: appointment.cancelled_by_role,
        cancelled_by_user_id: appointment.cancelled_by_user_id,
        cancelled_at: appointment.cancelled_at,
        refund_status: appointment.refund_status,

        // OWNER INFO with null safety
        owner: {
          id: appointment.owner_id,
          name: appointment.owner_name || 'Unknown',
          email: appointment.owner_email || '',
          phone: appointment.owner_contact || '',
          profile_photo: appointment.owner_profile_photo || null
        },
        owner_name: appointment.owner_name || 'Unknown',
        owner_email: appointment.owner_email || '',
        phone_number: appointment.owner_contact || '',
        profile_photo: appointment.owner_profile_photo || null,
        profile_photo_url: appointment.owner_profile_photo || null,

        // PET INFO with null safety
        pet: {
          id: appointment.pet_id,
          name: appointment.pet_name || 'Unknown Pet',
          breed: appointment.pet_breed || '',
          size: appointment.pet_size || '',
          age: appointment.pet_age || null,
          weight: appointment.pet_weight || null,
          photo: appointment.pet_photo || null,
          photo_url: appointment.pet_photo || null,
          species: appointment.pet_species || '',
          type: appointment.pet_species || '',
          gender: appointment.pet_gender || ''
        },

        // SERVICE INFO with null safety
        service_name: appointment.service_name || 'Unknown Service',
        service_category: appointment.service_category || '',
        service_description: appointment.service_description || '',
        service_image: appointment.service_image || null,

        // GROOMER INFO with proper null handling
        groomer: appointment.groomer_name ? {
          id: appointment.groomer_id,
          name: appointment.groomer_name,
          email: appointment.groomer_email || '',
          phone: appointment.groomer_contact || '',
          profile_picture: appointment.groomer_photo || null
        } : null,
        groomer_name: appointment.groomer_name || null,
        groomer_email: appointment.groomer_email || null,
        groomer_phone: appointment.groomer_contact || null,

        // ADDITIONAL SERVICES
        additional_services: additional_services,

        // RESCHEDULE HISTORY
        reschedule_history: reschedule_history,

        // RATING DATA
        has_rating: Boolean(appointment.has_rating),
        rating_id: appointment.rating_id,
        rating: appointment.rating_score,
        rating_score: appointment.rating_score,
        rating_review: appointment.rating_review,
        rating_data: appointment.rating_id ? {
          id: appointment.rating_id,
          rating: appointment.rating_score,
          review: appointment.rating_review,
          staff_rating: appointment.staff_rating || 0,
          service_rating: appointment.service_rating || 0,
          cleanliness_rating: appointment.cleanliness_rating || 0,
          value_rating: appointment.value_rating || 0,
          created_at: appointment.rating_date
        } : null

      };

      console.log(`Appointment ${id} loaded successfully with ${additional_services.length} additional services and ${reschedule_history.length} reschedule records`);
      return formattedAppointment;

    } catch (error) {
      console.error('Error in findByIdWithPetDetails:', error);
      console.error('Parameters passed:', { id });
      throw error;
    }
  }

  // FIXED: findAllForOwner method with corrected column references
  static async findAllForOwner(filters = {}) {
    try {
      let whereConditions = [];
      let queryParams = [];

      // Build WHERE conditions
      if (filters.status) {
        whereConditions.push('a.status = ?');
        queryParams.push(filters.status);
      }

      if (filters.date) {
        whereConditions.push('a.preferred_date = ?');
        queryParams.push(filters.date);
      }

      if (filters.groomer_id) {
        whereConditions.push('a.groomer_id = ?');
        queryParams.push(filters.groomer_id);
      }

      if (filters.customer_id) {
        whereConditions.push('a.owner_id = ?');
        queryParams.push(filters.customer_id);
      }

      if (filters.payment_status) {
        whereConditions.push('a.payment_status = ?');
        queryParams.push(filters.payment_status);
      }

      if (filters.service_id) {
        whereConditions.push('a.service_id = ?');
        queryParams.push(filters.service_id);
      }

      if (filters.search) {
        whereConditions.push('(u.name LIKE ? OR p.name LIKE ? OR gs.name LIKE ?)');
        const searchTerm = `%${filters.search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
      }

      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
      const orderBy = `ORDER BY a.queue_date DESC, a.daily_queue_number ASC`;
      const limit = filters.limit ? `LIMIT ${parseInt(filters.limit)}` : '';
      const offset = filters.page && filters.limit ?
        `OFFSET ${(parseInt(filters.page) - 1) * parseInt(filters.limit)}` : '';

      // FIXED: ENHANCED QUERY with correct column references
      const query = `
            SELECT 
                a.*,
                u.name as owner_name,
                u.contact_number as owner_contact,
                u.email as owner_email,
                u.profile_photo_url as owner_profile_photo,
                p.name as pet_name,
                p.breed as pet_breed,
                p.size as pet_size,
                p.age as pet_age,
                p.photo_url as pet_photo,
                p.type as pet_species,
                p.gender as pet_gender,
                gs.name as service_name,
                gs.category as service_category,
                gs.description as service_description,
                gs.image_url as service_image,
                groomer.name as groomer_name,
                groomer.email as groomer_email,
                groomer.contact_number as groomer_contact,
                groomer.profile_photo_url as groomer_photo
            FROM appointments a
            LEFT JOIN users u ON a.owner_id = u.id
            LEFT JOIN pets p ON a.pet_id = p.id
            LEFT JOIN grooming_services gs ON a.service_id = gs.id
            LEFT JOIN users groomer ON a.groomer_id = groomer.id
            ${whereClause}
            ${orderBy}
            ${limit} ${offset}
        `;

      const [rows] = await db.execute(query, queryParams);

      // Get additional services for all appointments in a single query
      const appointmentIds = rows.map(row => row.id);
      let additionalServicesMap = {};

      if (appointmentIds.length > 0) {
        const placeholders = appointmentIds.map(() => '?').join(',');
        const [additionalServicesRows] = await db.execute(`
                SELECT 
                    aps.appointment_id,
                    aps.id as appointment_service_id,
                    aps.service_id,
                    aps.price as service_price,
                    aps.payment_method,
                    aps.created_at,
                    gs.name as service_name,
                    gs.category,
                    gs.description,
                    gs.image_url
                FROM appointment_services aps
                JOIN grooming_services gs ON aps.service_id = gs.id
                WHERE aps.appointment_id IN (${placeholders})
                ORDER BY aps.created_at ASC
            `, appointmentIds);

        // Group additional services by appointment_id
        additionalServicesRows.forEach(service => {
          if (!additionalServicesMap[service.appointment_id]) {
            additionalServicesMap[service.appointment_id] = [];
          }
          additionalServicesMap[service.appointment_id].push({
            id: service.service_id,
            appointment_service_id: service.appointment_service_id,
            name: service.service_name,
            service_name: service.service_name,
            price: parseFloat(service.service_price),
            payment_method: service.payment_method,
            category: service.category,
            description: service.description,
            image_url: service.image_url,
            added_at: service.created_at
          });
        });
      }
      // Get session data for all appointments in a single query
      let sessionDataMap = {};

      if (appointmentIds.length > 0) {
        const placeholders = appointmentIds.map(() => '?').join(',');
        const [sessionRows] = await db.execute(`
        SELECT 
            appointment_id,
            id as session_id,
            start_time,
            end_time,
            duration_minutes,
            status as session_status
        FROM appointment_sessions 
        WHERE appointment_id IN (${placeholders})
        ORDER BY start_time DESC
    `, appointmentIds);

        // Group session data by appointment_id (taking the latest session)
        sessionRows.forEach(session => {
          if (!sessionDataMap[session.appointment_id]) {
            sessionDataMap[session.appointment_id] = {
              session_id: session.session_id,
              start_time: session.start_time,
              end_time: session.end_time,
              duration_minutes: session.duration_minutes,
              session_status: session.session_status
            };
          }
        });
      }
      // FIXED: Format appointments with corrected column references
      const appointments = rows.map(row => ({
        id: row.id,
        daily_queue_number: row.daily_queue_number,
        queue_date: row.queue_date,
        user_id: row.owner_id,
        owner_id: row.owner_id,
        pet_id: row.pet_id,
        service_id: row.service_id,
        groomer_id: row.groomer_id,
        preferred_date: row.preferred_date,
        preferred_time: row.preferred_time,
        actual_date: row.actual_date,
        actual_time: row.actual_time,
        status: row.status,
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        base_price: parseFloat(row.base_price || 0),
        matted_coat_fee: parseFloat(row.matted_coat_fee || 0),
        total_amount: parseFloat(row.total_amount || 0),
        special_notes: row.special_notes,
        duration_minutes: row.duration_minutes,
        session_data: sessionDataMap[row.id] || null,
        session_duration: sessionDataMap[row.id]?.duration_minutes || row.duration_minutes || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        has_images: Boolean(row.has_images),
        before_image: row.before_image,
        after_image: row.after_image,
        upload_notes: row.upload_notes,
        cancelled_reason: row.cancelled_reason,
        cancelled_by_role: row.cancelled_by_role,
        cancelled_by_user_id: row.cancelled_by_user_id,
        cancelled_at: row.cancelled_at,
        refund_status: row.refund_status,

        owner: {
          id: row.owner_id,
          name: row.owner_name,
          phone: row.owner_contact,
          email: row.owner_email,
          profile_photo: row.owner_profile_photo,
          profile_photo_url: row.owner_profile_photo
        },
        owner_name: row.owner_name,
        phone_number: row.owner_contact,

        // Pet details
        pet: {
          id: row.pet_id,
          name: row.pet_name,
          breed: row.pet_breed,
          size: row.pet_size,
          age: row.pet_age,
          photo: row.pet_photo,
          photo_url: row.pet_photo,
          species: row.pet_species,
          type: row.pet_species,
          gender: row.pet_gender
        },

        // Service details
        service_name: row.service_name,
        service_category: row.service_category,
        service_description: row.service_description,
        service_image: row.service_image,

        // FIXED: Groomer details with correct column references
        groomer: row.groomer_name ? {
          id: row.groomer_id,
          name: row.groomer_name,
          email: row.groomer_email,
          phone: row.groomer_contact, // FIXED: using contact_number
          profile_picture: row.groomer_photo // FIXED: using profile_photo_url
        } : null,
        groomer_name: row.groomer_name,
        groomer_email: row.groomer_email,
        groomer_phone: row.groomer_contact, // FIXED: using contact_number

        // Include additional_services
        additional_services: additionalServicesMap[row.id] || []
      }));

      console.log(`Retrieved ${appointments.length} appointments with additional services and groomer info`);

      return appointments;
    } catch (error) {
      console.error('Error in enhanced findAllForOwner:', error);
      throw error;
    }
  }

  // findByOwnerWithPetDetails method
  static async findByOwnerWithPetDetails(ownerId) {
    try {
      console.log('Enhanced query for owner ID:', ownerId);

      const [rows] = await db.execute(`
              SELECT DISTINCT
                  a.*,
                  p.name as pet_name,
                  p.photo_url as pet_photo,
                  p.type as pet_species,
                  p.breed,
                  p.size as pet_size,
                  p.gender,
                  p.age,
                  p.weight,
                  gs.name as service_name,
                  gs.description as service_description,
                  gs.category as service_category,
                  gs.image_url as service_image,
                  u.name as owner_name,
                  u.email as owner_email,
                  u.contact_number as phone_number,
                  u.profile_photo_url as owner_profile_photo,
                  groomer.name as groomer_name,
                  groomer.email as groomer_email,
                  groomer.contact_number as groomer_contact,
                  groomer.profile_photo_url as groomer_photo,
                  r.id as rating_id,
                  r.rating as rating_score,
                  r.review as rating_review,
                  r.staff_rating,
                  r.service_rating,
                  r.cleanliness_rating,
                  r.value_rating,
                  r.created_at as rating_date,
                  CASE 
                      WHEN r.id IS NOT NULL THEN TRUE 
                      ELSE FALSE 
                  END as has_rating
              FROM appointments a
              LEFT JOIN pets p ON a.pet_id = p.id
              LEFT JOIN grooming_services gs ON a.service_id = gs.id  
              LEFT JOIN users u ON a.owner_id = u.id
              LEFT JOIN users groomer ON a.groomer_id = groomer.id
              LEFT JOIN ratings r ON a.id = r.appointment_id  -- JOIN WITH RATINGS TABLE
              WHERE a.owner_id = ?
              ORDER BY a.queue_date DESC, a.daily_queue_number ASC, a.preferred_date DESC
          `, [ownerId]);

      console.log('Found appointments:', rows.length);

      // ✅ FIXED: Declare appointmentIds at the beginning
      const appointmentIds = rows.map(row => row.id);

      // Get session data for all appointments
      let sessionDataMap = {};

      if (appointmentIds.length > 0) {
        const placeholders = appointmentIds.map(() => '?').join(',');
        const [sessionRows] = await db.execute(`
              SELECT 
                  appointment_id,
                  id as session_id,
                  start_time,
                  end_time,
                  duration_minutes,
                  status as session_status
              FROM appointment_sessions 
              WHERE appointment_id IN (${placeholders})
              ORDER BY start_time DESC
          `, appointmentIds);

        sessionRows.forEach(session => {
          if (!sessionDataMap[session.appointment_id]) {
            sessionDataMap[session.appointment_id] = {
              session_id: session.session_id,
              start_time: session.start_time,
              end_time: session.end_time,
              duration_minutes: session.duration_minutes,
              session_status: session.session_status
            };
          }
        });
      }

      // Get additional services for all appointments in a single query
      let additionalServicesMap = {};

      if (appointmentIds.length > 0) {
        const placeholders = appointmentIds.map(() => '?').join(',');
        const [additionalServicesRows] = await db.execute(`
                  SELECT 
                      aps.appointment_id,
                      aps.id as appointment_service_id,
                      aps.service_id,
                      aps.price as service_price,
                      aps.payment_method,
                      aps.created_at,
                      gs.name as service_name,
                      gs.category,
                      gs.description,
                      gs.image_url
                  FROM appointment_services aps
                  JOIN grooming_services gs ON aps.service_id = gs.id
                  WHERE aps.appointment_id IN (${placeholders})
                  ORDER BY aps.created_at ASC
              `, appointmentIds);

        // Group additional services by appointment_id
        additionalServicesRows.forEach(service => {
          if (!additionalServicesMap[service.appointment_id]) {
            additionalServicesMap[service.appointment_id] = [];
          }
          additionalServicesMap[service.appointment_id].push({
            id: service.service_id,
            appointment_service_id: service.appointment_service_id,
            name: service.service_name,
            price: parseFloat(service.service_price),
            payment_method: service.payment_method,
            category: service.category,
            description: service.description,
            image_url: service.image_url,
            added_at: service.created_at
          });
        });
      }

      // Transform data with corrected column references
      const transformedData = rows.map(row => {
        return {
          id: row.id,
          daily_queue_number: row.daily_queue_number,
          queue_date: row.queue_date,
          pet_id: row.pet_id,
          owner_id: row.owner_id,
          service_id: row.service_id,
          groomer_id: row.groomer_id,
          preferred_date: row.preferred_date,
          preferred_time: row.preferred_time,
          actual_date: row.actual_date,
          actual_time: row.actual_time,
          base_price: parseFloat(row.base_price || 0),
          matted_coat_fee: parseFloat(row.matted_coat_fee || 0),
          total_amount: parseFloat(row.total_amount || 0),
          special_notes: row.special_notes,
          duration_minutes: row.duration_minutes,
          session_data: sessionDataMap[row.id] || null,
          session_duration: sessionDataMap[row.id]?.duration_minutes || row.duration_minutes || null,
          status: row.status,
          payment_status: row.payment_status,
          payment_method: row.payment_method,
          total_amount: parseFloat(row.total_amount || 0),
          created_at: row.created_at,
          updated_at: row.updated_at,
          cancelled_reason: row.cancelled_reason,
          cancelled_by_role: row.cancelled_by_role,
          cancelled_by_user_id: row.cancelled_by_user_id,
          cancelled_at: row.cancelled_at,
          refund_status: row.refund_status,
          has_images: Boolean(row.has_images),
          before_image: row.before_image,
          after_image: row.after_image,
          upload_notes: row.upload_notes,

          // Primary service info
          service_name: row.service_name,
          service_description: row.service_description,
          service_category: row.service_category,
          service_image: row.service_image,

          // Pet info
          pet: row.pet_name ? {
            id: row.pet_id,
            name: row.pet_name,
            photo: row.pet_photo,
            photo_url: row.pet_photo,
            species: row.pet_species,
            type: row.pet_species,
            breed: row.breed,
            size: row.pet_size,
            gender: row.gender,
            age: row.age,
            weight: parseFloat(row.weight || 0)
          } : null,

          // Owner info
          owner_name: row.owner_name,
          owner_email: row.owner_email,
          phone_number: row.phone_number,
          profile_photo: row.owner_profile_photo,
          profile_photo_url: row.owner_profile_photo,

          // Groomer info with correct column references
          groomer: row.groomer_name ? {
            id: row.groomer_id,
            name: row.groomer_name,
            email: row.groomer_email,
            phone: row.groomer_contact,
            profile_picture: row.groomer_photo
          } : null,
          groomer_name: row.groomer_name,
          groomer_email: row.groomer_email,
          groomer_phone: row.groomer_contact,

          // Rating information
          rating_id: row.rating_id,
          rating: row.rating_score,
          rating_score: row.rating_score,
          rating_review: row.rating_review,
          has_rating: Boolean(row.has_rating),
          rating_data: row.rating_id ? {
            id: row.rating_id,
            rating: row.rating_score,
            review: row.rating_review,
            staff_rating: row.staff_rating,
            service_rating: row.service_rating,
            cleanliness_rating: row.cleanliness_rating,
            value_rating: row.value_rating,
            created_at: row.rating_date
          } : null,

          // Additional services
          additional_services: additionalServicesMap[row.id] || []
        };
      });

      console.log('Enhanced data with additional services and groomer info:', transformedData.length);

      // Add debug log for rating information
      const withRatings = transformedData.filter(a => a.has_rating).length;
      console.log(`Appointments with ratings: ${withRatings}/${transformedData.length}`);

      return transformedData;
    } catch (error) {
      console.error('Error in enhanced findByOwnerWithPetDetails:', error);
      throw error;
    }
  }
  // Fixed findByIdWithAllDetails method - 
  static async findByIdWithAllDetails(id) {
    try {
      console.log(`Fetching appointment ${id} with all details including multiple additional services`);

      const [appointmentRows] = await db.execute(`
      SELECT 
        a.*,
        u.name as owner_name,
        u.email as owner_email, 
        u.contact_number as owner_contact,
        p.name as pet_name,
        p.breed as pet_breed,
        p.size as pet_size,
        p.age as pet_age,
        p.weight as pet_weight,
        p.photo_url as pet_photo,
        p.type as pet_species,
        p.gender as pet_gender,
        gs.name as service_name,
        gs.category as service_category,
        gs.description as service_description,
        gs.image_url as service_image,
        groomer.name as groomer_name,
        groomer.email as groomer_email,
        groomer.contact_number as groomer_contact,
        groomer.profile_photo_url as groomer_photo,
        -- ADD MISSING RATING INFORMATION
        r.id as rating_id,
        r.rating as rating_score,
        r.review as rating_review,
        r.staff_rating,
        r.service_rating,
        r.cleanliness_rating,
        r.value_rating,
        r.created_at as rating_date,
        CASE 
            WHEN r.id IS NOT NULL THEN TRUE 
            ELSE FALSE 
        END as has_rating
      FROM appointments a
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users groomer ON a.groomer_id = groomer.id
      LEFT JOIN ratings r ON a.id = r.appointment_id  -- ADD MISSING RATING JOIN
      WHERE a.id = ?
    `, [id]);

      if (appointmentRows.length === 0) {
        console.log(`Appointment ${id} not found`);
        return null;
      }

      const appointment = appointmentRows[0];

      // Get additional services
      const [additionalServicesRows] = await db.execute(`
      SELECT 
        aps.id as appointment_service_id,
        aps.service_id,
        aps.price as service_price,
        aps.payment_method,
        aps.created_at as service_added_at,
        gs.name as service_name,
        gs.description,
        gs.category,
        gs.image_url,
        gs.time_description,
        gs.status as service_status
      FROM appointment_services aps
      JOIN grooming_services gs ON aps.service_id = gs.id
      WHERE aps.appointment_id = ?
      ORDER BY aps.created_at ASC
    `, [id]);

      // Get reschedule history
      // ENHANCED RESCHEDULE HISTORY QUERY with proper JOIN and fallbacks
      const [rescheduleHistoryRows] = await db.execute(`
SELECT 
  arh.old_preferred_date,
  arh.old_preferred_time,
  arh.new_preferred_date,
  arh.new_preferred_time,
  arh.reason,
  arh.rescheduled_by_role,
  arh.rescheduled_at,
  arh.rescheduled_by_user_id,
  u.name as rescheduled_by_name,
  u.role as user_role,
  u.staff_type,
  CASE 
    WHEN u.id IS NOT NULL THEN u.name
    WHEN arh.rescheduled_by_role = 'owner' THEN 'Business Owner'
    WHEN arh.rescheduled_by_role = 'staff' THEN 'Staff Member'
    WHEN arh.rescheduled_by_role = 'pet_owner' THEN 'Customer'
    ELSE 'System'
  END as display_name,
  CASE 
    WHEN u.id IS NOT NULL THEN u.role
    ELSE arh.rescheduled_by_role
  END as display_role
FROM appointment_reschedule_history arh
LEFT JOIN users u ON arh.rescheduled_by_user_id = u.id
WHERE arh.appointment_id = ?
ORDER BY arh.rescheduled_at ASC
`, [id]);

      console.log(`Found ${additionalServicesRows.length} additional services for appointment ${id}`);


      // Format reschedule history

      const reschedule_history = rescheduleHistoryRows.map(history => ({
        old_date: history.old_preferred_date,
        old_time: Appointment.convertTo12Hour(history.old_preferred_time),
        new_date: history.new_preferred_date,
        new_time: Appointment.convertTo12Hour(history.new_preferred_time),
        reason: history.reason || 'No reason provided',
        rescheduled_by: history.rescheduled_by_role,
        rescheduled_by_name: history.display_name, // Use enhanced display name
        rescheduled_by_role: history.display_role, // Use enhanced display role
        rescheduled_by_user_id: history.rescheduled_by_user_id,
        staff_type: history.staff_type,
        rescheduled_at: history.rescheduled_at,
        // ADD formatted display for UI
        display_text: `${history.display_name} (${history.display_role})`,
        has_user_data: Boolean(history.rescheduled_by_user_id)
      }));
      // Get session data
      const [sessionRows] = await db.execute(`
    SELECT 
        id as session_id,
        start_time,
        end_time,
        duration_minutes,
        status as session_status
    FROM appointment_sessions 
    WHERE appointment_id = ?
    ORDER BY start_time DESC 
    LIMIT 1
`, [id]);

      const sessionData = sessionRows.length > 0 ? {
        session_id: sessionRows[0].session_id,
        start_time: sessionRows[0].start_time,
        end_time: sessionRows[0].end_time,
        duration_minutes: sessionRows[0].duration_minutes,
        session_status: sessionRows[0].session_status
      } : null;
      // Format additional services
      const additional_services = additionalServicesRows.map((service, index) => ({
        id: service.service_id,
        appointment_service_id: service.appointment_service_id,
        name: service.service_name,
        price: parseFloat(service.service_price),
        payment_method: service.payment_method,
        category: service.category,
        description: service.description,
        image_url: service.image_url,
        time_description: service.time_description,
        service_status: service.service_status,
        added_at: service.service_added_at,
        order: index + 1
      }));

      // Build the complete appointment object
      const formattedAppointment = {
        id: appointment.id,
        daily_queue_number: appointment.daily_queue_number || null,
        queue_date: appointment.queue_date || null,
        customer_id: appointment.owner_id,
        owner_id: appointment.owner_id,
        pet_id: appointment.pet_id,
        service_id: appointment.service_id,
        groomer_id: appointment.groomer_id,
        preferred_date: appointment.preferred_date,
        preferred_time: appointment.preferred_time,
        reschedule_history: reschedule_history,
        actual_date: appointment.actual_date,
        actual_time: appointment.actual_time,
        status: appointment.status,
        base_price: parseFloat(appointment.base_price || 0),
        matted_coat_fee: parseFloat(appointment.matted_coat_fee || 0),
        total_amount: parseFloat(appointment.total_amount || 0),
        payment_status: appointment.payment_status,
        payment_method: appointment.payment_method,
        special_notes: appointment.special_notes,
        duration_minutes: appointment.duration_minutes,
        session_data: sessionData,
        session_duration: sessionData?.duration_minutes || appointment.duration_minutes || null,
        created_at: appointment.created_at,
        updated_at: appointment.updated_at,
        cancelled_reason: appointment.cancelled_reason,
        cancelled_by_role: appointment.cancelled_by_role,
        cancelled_by_user_id: appointment.cancelled_by_user_id,
        cancelled_at: appointment.cancelled_at,
        refund_status: appointment.refund_status,
        has_images: Boolean(appointment.has_images),
        before_image: appointment.before_image,
        after_image: appointment.after_image,
        upload_notes: appointment.upload_notes,

        // Owner/Customer info
        owner: {
          id: appointment.owner_id,
          name: appointment.owner_name,
          email: appointment.owner_email,
          phone: appointment.owner_contact
        },
        owner_name: appointment.owner_name,
        owner_email: appointment.owner_email,
        phone_number: appointment.owner_contact,

        // Pet info
        pet: {
          id: appointment.pet_id,
          name: appointment.pet_name,
          breed: appointment.pet_breed,
          size: appointment.pet_size,
          age: appointment.pet_age,
          weight: appointment.pet_weight,
          photo: appointment.pet_photo,
          photo_url: appointment.pet_photo,
          species: appointment.pet_species,
          type: appointment.pet_species,
          gender: appointment.pet_gender
        },

        // Primary Service info
        service_name: appointment.service_name,
        service_category: appointment.service_category,
        service_description: appointment.service_description,
        service_image: appointment.service_image,

        // Groomer info
        groomer: appointment.groomer_name ? {
          id: appointment.groomer_id,
          name: appointment.groomer_name,
          email: appointment.groomer_email,
          phone: appointment.groomer_contact,
          profile_picture: appointment.groomer_photo
        } : null,
        groomer_name: appointment.groomer_name,
        groomer_email: appointment.groomer_email,
        groomer_phone: appointment.groomer_contact,

        // Additional services array
        additional_services: additional_services,

        // RATING DATA
        has_rating: Boolean(appointment.has_rating),
        rating_id: appointment.rating_id,
        rating: appointment.rating_score,
        rating_score: appointment.rating_score,
        rating_review: appointment.rating_review,
        rating_data: appointment.rating_id ? {
          id: appointment.rating_id,
          rating: appointment.rating_score,
          review: appointment.rating_review,
          staff_rating: appointment.staff_rating || 0,
          service_rating: appointment.service_rating || 0,
          cleanliness_rating: appointment.cleanliness_rating || 0,
          value_rating: appointment.value_rating || 0,
          created_at: appointment.rating_date
        } : null,

        // Service summary information
        service_summary: {
          primary_service: {
            id: appointment.service_id,
            name: appointment.service_name,
            category: appointment.service_category,
            base_price: parseFloat(appointment.base_price || 0)
          },
          additional_services_count: additional_services.length,
          additional_services_total: additional_services.reduce((sum, service) =>
            sum + parseFloat(service.price), 0
          ),
          total_services_count: 1 + additional_services.length,
          all_service_names: [
            appointment.service_name,
            ...additional_services.map(s => s.name)
          ].join(' + ')
        }
      };

      console.log(`Appointment ${id} loaded successfully:`, {
        primary_service: appointment.service_name,
        additional_services_count: additional_services.length,
        total_services: formattedAppointment.service_summary.total_services_count,
        total_amount: formattedAppointment.total_amount,
        groomer: appointment.groomer_name || 'Not assigned',
        payment_status: appointment.payment_status
      });

      return formattedAppointment;

    } catch (error) {
      console.error('Error in findByIdWithAllDetails:', error);
      throw error;
    }
  }

  static async getBookedTimeSlots(date) {
    try {
      const [rows] = await db.execute(
        `SELECT DISTINCT 
          COALESCE(actual_time, preferred_time) as booked_time
       FROM appointments 
       WHERE DATE(COALESCE(actual_date, preferred_date)) = ?
       AND status NOT IN ('cancelled', 'no_show')
       AND COALESCE(actual_time, preferred_time) IS NOT NULL
       ORDER BY booked_time`,
        [date]
      );

      // ✅ ENSURE ALL TIMES ARE IN 12-HOUR FORMAT
      return rows.map(row => {
        const time = row.booked_time;

        // If time is in 24-hour format, convert to 12-hour
        if (!time.includes('AM') && !time.includes('PM')) {
          return this.convertTo12Hour(time);
        }

        // Already in 12-hour format, return as-is
        return time;
      });

    } catch (error) {
      console.error('Error in getBookedTimeSlots:', error);
      throw error;
    }
  }
  static async getAvailableTimeSlots(date, serviceId) {
    try {
      // ✅ Base time slots in 12-hour format
      const allTimeSlots = [
        '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
        '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'
      ];

      // Get booked slots from database
      const [bookedRows] = await db.execute(`
          SELECT DISTINCT preferred_time 
          FROM appointments 
          WHERE preferred_date = ? 
          AND status NOT IN ('cancelled', 'completed')
          ORDER BY preferred_time
      `, [date]);

      // ✅ Convert database times to 12-hour format
      const bookedTimeSlots = bookedRows.map(row => {
        return this.convertTo12Hour(row.preferred_time);
      });

      // Calculate available slots
      const availableTimeSlots = allTimeSlots.filter(slot =>
        !bookedTimeSlots.includes(slot)
      );

      console.log('🕐 Time slots processed (12-hour format):', {
        date,
        allSlots: allTimeSlots,
        bookedSlots: bookedTimeSlots,
        availableSlots: availableTimeSlots
      });

      return {
        allTimeSlots,
        availableTimeSlots,
        bookedTimeSlots
      };

    } catch (error) {
      console.error('❌ Error in getAvailableTimeSlots:', error);
      throw error;
    }
  }

  static async removeService(appointmentId, serviceId) {
    const sql = `
        DELETE FROM appointment_services 
        WHERE appointment_id = ? AND service_id = ?
      `;
    const [result] = await db.query(sql, [appointmentId, serviceId]);
    return result.affectedRows > 0;
  }

  static convertTo12Hour(time24h) {
    if (!time24h) return '';

    const timeParts = time24h.split(':');
    if (timeParts.length < 2) return time24h;

    let hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];

    if (isNaN(hours)) return time24h;

    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12

    return `${hours}:${minutes} ${ampm}`;
  }

  static async addService(appointmentId, serviceId, price) {
    const sql = `
        INSERT INTO appointment_services (appointment_id, service_id, price, added_at) 
        VALUES (?, ?, ?, NOW())
      `;
    const [result] = await db.query(sql, [appointmentId, serviceId, price]);
    return result.insertId;
  }

  static async getAppointmentServices(appointmentId) {
    const sql = `
        SELECT 
          ast.id,
          ast.appointment_id,
          ast.service_id,
          ast.price,
          ast.added_at,
          gs.name as service_name,
          gs.description as service_description,
          gs.category as service_category,
          gs.image_url as service_image
        FROM appointment_services ast
        LEFT JOIN grooming_services gs ON ast.service_id = gs.id
        WHERE ast.appointment_id = ?
        ORDER BY ast.added_at ASC
      `;
    const [rows] = await db.query(sql, [appointmentId]);
    return rows;
  }
  // Keep all your other existing methods but make sure they use correct column names
  static async getAppointmentSummary(appointmentId) {
    try {
      const appointment = await this.findByIdWithPetDetails(appointmentId);

      if (!appointment) {
        return null;
      }

      return {
        id: appointment.id,
        status: appointment.status,
        payment_status: appointment.payment_status,
        total_amount: appointment.total_amount,
        base_price: appointment.base_price,
        matted_coat_fee: appointment.matted_coat_fee,

        // Groomer info
        has_groomer: !!appointment.groomer_id,
        groomer_id: appointment.groomer_id,
        groomer_name: appointment.groomer_name,

        // Services info
        primary_service: appointment.service_name,
        additional_services_count: appointment.additional_services?.length || 0,
        additional_services: appointment.additional_services || [],

        // Calculated totals
        calculated_total: (
          parseFloat(appointment.base_price || 0) +
          parseFloat(appointment.matted_coat_fee || 0) +
          (appointment.additional_services || []).reduce((sum, service) =>
            sum + parseFloat(service.price || 0), 0
          )
        )
      };
    } catch (error) {
      console.error('❌ Error getting appointment summary:', error);
      throw error;
    }
  }



  static async hasAdditionalServices(appointmentId) {
    try {
      const [rows] = await db.execute(
        'SELECT COUNT(*) as count FROM appointment_services WHERE appointment_id = ?',
        [appointmentId]
      );
      return rows[0].count > 0;
    } catch (error) {
      console.error('❌ Error checking additional services:', error);
      return false;
    }
  }

  static async recalculatePricing(appointmentId) {
    const appointment = await this.findById(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const additionalServices = await this.getAppointmentServices(appointmentId);

    const baseAmount = parseFloat(appointment.base_price || 0);
    const mattedCoatFee = parseFloat(appointment.matted_coat_fee || 0);
    const additionalServicesTotal = additionalServices.reduce((sum, service) => {
      return sum + parseFloat(service.price || 0);
    }, 0);

    const newTotal = baseAmount + mattedCoatFee + additionalServicesTotal;

    await this.update(appointmentId, { total_amount: newTotal });

    const updatedAppointment = await this.findByIdWithPetDetails(appointmentId);
    updatedAppointment.additional_services = additionalServices;

    return updatedAppointment;
  }

  static async checkPetActiveAppointments(petId, ownerId) {
    const sql = `
        SELECT 
          a.id,
          a.pet_id,
          a.preferred_date,
          a.preferred_time,
          a.actual_date,
          a.actual_time,
          a.status,
          a.payment_status,
          p.name as pet_name,
          gs.name as service_name,
          gs.category as service_category
        FROM appointments a
        LEFT JOIN pets p ON a.pet_id = p.id
        LEFT JOIN grooming_services gs ON a.service_id = gs.id
        WHERE a.pet_id = ? 
        AND a.owner_id = ?
        AND a.status IN ('pending', 'confirmed', 'in_progress')
        ORDER BY a.preferred_date ASC, a.preferred_time ASC
        LIMIT 1
      `;

    const [rows] = await db.query(sql, [petId, ownerId]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async checkForDuplicates(ownerId, petId, serviceId, preferredDate, preferredTime) {
    const sql = `
        SELECT id, status 
        FROM appointments 
        WHERE owner_id = ? 
        AND pet_id = ? 
        AND service_id = ? 
        AND preferred_date = ? 
        AND preferred_time = ? 
        AND status NOT IN ('cancelled', 'completed')
        ORDER BY created_at DESC
        LIMIT 1
      `;

    const [rows] = await db.query(sql, [ownerId, petId, serviceId, preferredDate, preferredTime]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async findById(appointmentId) {
    const sql = `SELECT * FROM appointments WHERE id = ?`;
    const [rows] = await db.query(sql, [appointmentId]);
    return rows[0] || null;
  }

  static async update(appointmentId, updateData) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Get current appointment data
      const [currentRows] = await connection.execute(
        'SELECT * FROM appointments WHERE id = ? FOR UPDATE',
        [appointmentId]
      );

      if (currentRows.length === 0) {
        throw new Error('Appointment not found');
      }

      const currentAppointment = currentRows[0];

      // =============================================
      // DAILY QUEUE LOGIC (use assignDailyQueueNumber)
      // =============================================
      if (updateData.status === 'waiting') {
        const today = new Date().toISOString().split('T')[0];
        if (currentAppointment.queue_date !== today) {
          // Pass the existing connection to avoid deadlock
          const nextQueueNumber = await Appointment.assignDailyQueueNumber(appointmentId, connection);
          updateData.daily_queue_number = nextQueueNumber;
          updateData.queue_date = today;

          // Set actual date/time if not provided
          if (!updateData.actual_date && !currentAppointment.actual_date) {
            updateData.actual_date = today;
          }
          if (!updateData.actual_time && !currentAppointment.actual_time) {
            const now = new Date();
            updateData.actual_time = now.toTimeString().split(' ')[0];
          }

          console.log(`Assigned daily queue #${nextQueueNumber} to appointment ${appointmentId}`);
        }
      }
      // =============================================
      // END OF QUEUE LOGIC
      // =============================================

      // 2. If changing date/time, verify availability
      if (updateData.preferred_date || updateData.preferred_time) {
        const checkDate = updateData.preferred_date || currentAppointment.preferred_date;
        const checkTime = updateData.preferred_time || currentAppointment.preferred_time;

        const [conflicts] = await connection.execute(
          `SELECT id FROM appointments 
             WHERE ((preferred_date = ? AND preferred_time = ?) 
                    OR (actual_date = ? AND actual_time = ?))
             AND id != ?
             AND status NOT IN ('cancelled', 'completed', 'no_show')`,
          [checkDate, checkTime, checkDate, checkTime, appointmentId]
        );

        if (conflicts.length > 0) {
          throw new Error('TIME_SLOT_UNAVAILABLE');
        }
      }

      // 3. Prepare update fields
      const allowedFields = [
        'preferred_date', 'preferred_time', 'actual_date', 'actual_time',
        'groomer_id', 'base_price', 'matted_coat_fee', 'total_amount',
        'special_notes', 'status', 'payment_status', 'payment_method',
        'queue_number', 'duration_minutes',
        'daily_queue_number', 'queue_date' // make sure these two are included
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

      updateValues.push(appointmentId);

      // 4. Execute update
      const [result] = await connection.execute(
        `UPDATE appointments 
           SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        updateValues
      );

      if (result.affectedRows === 0) {
        throw new Error('Update failed - no rows affected');
      }

      await connection.commit();

      return {
        success: true,
        affectedRows: result.affectedRows
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }


  static async updateStatus(appointmentId, status) {
    const sql = `
        UPDATE appointments 
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
    const [result] = await db.query(sql, [status, appointmentId]);
    return result.affectedRows > 0;
  }

  static async delete(appointmentId) {
    const sql = `DELETE FROM appointments WHERE id = ?`;
    const [result] = await db.query(sql, [appointmentId]);
    return result.affectedRows > 0;
  }



  // ✅ FIXED: Enhanced method with correct column references
  static async findTodaysAppointments(date) {
    const sql = `
      SELECT 
        a.*,
        a.daily_queue_number as queue_number,  
        a.queue_date,                          
        p.name as pet_name,
        p.photo_url as pet_photo,
        p.type as pet_species,
        p.breed,
        p.size as pet_size,
        p.gender as pet_gender,
        gs.name as service_name,
        gs.category as service_category,
        u.name as owner_name,
        u.contact_number as phone_number,
        u.email as owner_email,
        u.profile_photo_url as owner_profile_photo,
        g.name as groomer_name
      FROM appointments a
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN users g ON a.groomer_id = g.id
      WHERE (a.preferred_date = ? OR a.actual_date = ?)
      AND a.status NOT IN ('cancelled')
      ORDER BY a.daily_queue_number ASC, COALESCE(a.actual_time, a.preferred_time) ASC
    `;

    const [rows] = await db.query(sql, [date, date, date]);

    return rows.map(row => ({
      id: row.id,
      daily_queue_number: row.queue_number,
      queue_date: row.queue_date,
      pet_id: row.pet_id,
      owner_id: row.owner_id,
      service_id: row.service_id,
      preferred_date: row.preferred_date,
      preferred_time: row.preferred_time,
      actual_date: row.actual_date,
      actual_time: row.actual_time,
      groomer_id: row.groomer_id,
      base_price: parseFloat(row.base_price || 0),
      matted_coat_fee: parseFloat(row.matted_coat_fee || 0),
      total_amount: parseFloat(row.total_amount || 0),
      special_notes: row.special_notes,
      status: row.status,
      payment_status: row.payment_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      has_images: Boolean(row.has_images),
      before_image: row.before_image,
      after_image: row.after_image,
      upload_notes: row.upload_notes,
      service_name: row.service_name,
      service_category: row.service_category,
      groomer_name: row.groomer_name,

      pet: {
        id: row.pet_id,
        name: row.pet_name,
        photo: row.pet_photo,
        species: row.pet_species,
        breed: row.breed,
        size: row.pet_size,
        gender: row.pet_gender
      },

      owner: {
        id: row.owner_id,
        name: row.owner_name,
        phone: row.phone_number,
        profile_photo: row.owner_profile_photo,
        profile_photo_url: row.owner_profile_photo
      }
    }));
  }

  static async findByDateRange(startDate, endDate, filters = {}) {
    let sql = `
      SELECT 
        a.*,
        a.daily_queue_number,  
        a.queue_date,          
        p.name as pet_name,
        p.photo_url as pet_photo,
        p.type as pet_species,
        p.breed,
        p.size as pet_size,
        p.gender as pet_gender,
        gs.name as service_name,
        gs.category as service_category,
        u.name as owner_name,
        u.contact_number as phone_number,
        u.email as owner_email,
        u.profile_photo_url as owner_profile_photo,
        g.name as groomer_name
      FROM appointments a
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN users g ON a.groomer_id = g.id
      WHERE (
        (a.preferred_date BETWEEN ? AND ?) OR 
        (a.actual_date BETWEEN ? AND ?) OR
        (a.queue_date BETWEEN ? AND ?)
      )
    `;

    const params = [startDate, endDate, startDate, endDate, startDate, endDate];

    if (filters.status) {
      sql += ` AND a.status = ?`;
      params.push(filters.status);
    }

    if (filters.groomer_id) {
      sql += ` AND a.groomer_id = ?`;
      params.push(filters.groomer_id);
    }

    sql += `ORDER BY a.queue_date DESC, a.daily_queue_number ASC, a.preferred_date ASC`;

    const [rows] = await db.query(sql, params);

    return rows.map(row => ({
      id: row.id,
      daily_queue_number: row.daily_queue_number,
      queue_date: row.queue_date,
      pet_id: row.pet_id,
      owner_id: row.owner_id,
      service_id: row.service_id,
      preferred_date: row.preferred_date,
      preferred_time: row.preferred_time,
      actual_date: row.actual_date,
      actual_time: row.actual_time,
      groomer_id: row.groomer_id,
      base_price: parseFloat(row.base_price || 0),
      matted_coat_fee: parseFloat(row.matted_coat_fee || 0),
      total_amount: parseFloat(row.total_amount || 0),
      special_notes: row.special_notes,
      status: row.status,
      payment_status: row.payment_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      service_name: row.service_name,
      service_category: row.service_category,
      groomer_name: row.groomer_name,

      pet: {
        id: row.pet_id,
        name: row.pet_name,
        photo: row.pet_photo,
        species: row.pet_species,
        breed: row.breed,
        size: row.pet_size,
        gender: row.pet_gender
      },

      owner: {
        id: row.owner_id,
        name: row.owner_name,
        phone: row.phone_number,
        profile_photo: row.owner_profile_photo,  // ✅ ADD THIS
        profile_photo_url: row.owner_profile_photo  // ✅ ADD THIS
      }
    }));
  }


  static async findByStatus(status) {
    const sql = `
      SELECT 
        a.*,
        a.daily_queue_number,  
        a.queue_date,         
        p.name as pet_name,
        p.photo_url as pet_photo,
        p.type as pet_species,
        p.breed,
        p.size as pet_size,
        p.gender as pet_gender,
        gs.name as service_name,
        gs.category as service_category,
        u.name as owner_name,
        u.contact_number as phone_number,
        u.profile_photo_url as owner_profile_photo,
        g.name as groomer_name
      FROM appointments a
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN users g ON a.groomer_id = g.id
      WHERE a.status = ?
      ORDER BY a.queue_date DESC, a.daily_queue_number ASC
    `;

    const [rows] = await db.query(sql, [status]);

    return rows.map(row => ({
      id: row.id,
      daily_queue_number: row.daily_queue_number,
      queue_date: row.queue_date,
      pet_id: row.pet_id,
      owner_id: row.owner_id,
      service_id: row.service_id,
      preferred_date: row.preferred_date,
      preferred_time: row.preferred_time,
      actual_date: row.actual_date,
      actual_time: row.actual_time,
      groomer_id: row.groomer_id,
      base_price: parseFloat(row.base_price || 0),
      matted_coat_fee: parseFloat(row.matted_coat_fee || 0),
      total_amount: parseFloat(row.total_amount || 0),
      special_notes: row.special_notes,
      status: row.status,
      payment_status: row.payment_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      service_name: row.service_name,
      service_category: row.service_category,
      groomer_name: row.groomer_name,

      pet: {
        id: row.pet_id,
        name: row.pet_name,
        photo: row.pet_photo,
        species: row.pet_species,
        breed: row.breed,
        size: row.pet_size,
        gender: row.pet_gender
      },

      owner: {
        id: row.owner_id,
        name: row.owner_name,
        phone: row.phone_number,
        profile_photo: row.owner_profile_photo,
        profile_photo_url: row.owner_profile_photo
      }
    }));
  }

  // ✅ FIXED: findByGroomer with correct column references
  static async findByGroomer(groomerId, filters = {}) {
    let sql = `
      SELECT 
        a.*,
        a.daily_queue_number, 
        a.queue_date,         
        p.name as pet_name,
        p.photo_url as pet_photo,
        p.type as pet_species,
        p.breed,
        p.size as pet_size,
        p.gender as pet_gender, 
        gs.name as service_name,
        gs.category as service_category,
        u.name as owner_name,
        u.contact_number as phone_number,
        u.profile_photo_url as owner_profile_photo,
        g.name as groomer_name
      FROM appointments a
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN users g ON a.groomer_id = g.id
      WHERE a.groomer_id = ?
    `;

    const params = [groomerId];

    if (filters.date) {
      sql += ` AND (a.preferred_date = ? OR a.actual_date = ?)`;
      params.push(filters.date, filters.date);
    }

    if (filters.status) {
      sql += ` AND a.status = ?`;
      params.push(filters.status);
    }

    sql += `ORDER BY a.queue_date DESC, a.daily_queue_number ASC, a.preferred_date DESC`;

    const [rows] = await db.query(sql, params);

    return rows.map(row => ({
      id: row.id,
      daily_queue_number: row.daily_queue_number,
      queue_date: row.queue_date,
      pet_id: row.pet_id,
      owner_id: row.owner_id,
      service_id: row.service_id,
      preferred_date: row.preferred_date,
      preferred_time: row.preferred_time,
      actual_date: row.actual_date,
      actual_time: row.actual_time,
      groomer_id: row.groomer_id,
      base_price: parseFloat(row.base_price || 0),
      matted_coat_fee: parseFloat(row.matted_coat_fee || 0),
      total_amount: parseFloat(row.total_amount || 0),
      special_notes: row.special_notes,
      status: row.status,
      payment_status: row.payment_status,
      created_at: row.created_at,
      updated_at: row.updated_at,

      service_name: row.service_name,
      service_category: row.service_category,
      groomer_name: row.groomer_name,

      pet: {
        id: row.pet_id,
        name: row.pet_name,
        photo: row.pet_photo,
        species: row.pet_species,
        breed: row.breed,
        size: row.pet_size,
        gender: row.pet_gender
      },

      owner: {
        id: row.owner_id,
        name: row.owner_name,
        phone: row.phone_number,
        profile_photo: row.owner_profile_photo,  // ✅ ADD THIS
        profile_photo_url: row.owner_profile_photo  // ✅ ADD THIS
      }
    }));
  }

  // models\Appointment.js Get appointment statistics for owner dashboard
  static async getOwnerStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_count,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_count,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show_count,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payment_count,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN total_amount ELSE 0 END) as completed_revenue,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_appointments,
        COUNT(CASE WHEN preferred_date = CURDATE() THEN 1 END) as today_scheduled
        COUNT(CASE WHEN queue_date = ? THEN 1 END) as today_queued_appointments,
        COUNT(CASE WHEN queue_date = ? AND status = 'in_progress' THEN 1 END) as today_active_queued,
        COUNT(CASE WHEN queue_date = ? AND status = 'waiting' THEN 1 END) as today_waiting_queued
      FROM appointments
    `;

    const [rows] = await db.query(sql);
    return rows[0];
  }

  // Enhanced payment sync methods
  static async syncPaymentStatusWithPayments(appointmentId) {
    try {
      const Payment = require('./Payment'); // Import Payment model

      console.log(`🔄 Syncing payment status for appointment ${appointmentId}`);

      // Get all payment records for this appointment
      const payments = await Payment.findByAppointment(appointmentId);

      let appointmentPaymentStatus = 'pending';
      let paymentMethod = null;

      console.log(`📊 Found ${payments.length} payment records for appointment ${appointmentId}`);

      if (payments.length === 0) {
        appointmentPaymentStatus = 'pending';
        console.log('💡 No payments found, setting status to pending');
      } else {
        payments.forEach((payment, index) => {
          console.log(`   Payment ${index + 1}: ID=${payment.id}, Status=${payment.status}, Amount=${payment.amount}`);
        });

        const hasCompleted = payments.some(p => p.status === 'completed');
        const hasFailed = payments.some(p => p.status === 'failed');
        const hasCancelled = payments.some(p => p.status === 'cancelled');
        const hasPending = payments.some(p => p.status === 'pending');

        if (hasCompleted) {
          appointmentPaymentStatus = 'paid';
          const completedPayment = payments.find(p => p.status === 'completed');
          paymentMethod = completedPayment.payment_method;
          console.log(`✅ Found completed payment, setting appointment to PAID`);
        } else if (hasFailed && !hasPending) {
          appointmentPaymentStatus = 'failed';
          console.log(`❌ All payments failed, setting appointment to FAILED`);
        } else if (hasCancelled && !hasPending && !hasCompleted) {
          appointmentPaymentStatus = 'cancelled';
          console.log(`🚫 All payments cancelled, setting appointment to CANCELLED`);
        } else {
          appointmentPaymentStatus = 'pending';
          console.log(`⏳ Some payments still pending, keeping appointment as PENDING`);
        }
      }

      const updateData = { payment_status: appointmentPaymentStatus };
      if (paymentMethod) {
        updateData.payment_method = paymentMethod;
      }

      console.log(`🔧 Updating appointment ${appointmentId} payment_status to: ${appointmentPaymentStatus}`);

      await this.update(appointmentId, updateData);

      console.log(`✅ Successfully synced payment status for appointment ${appointmentId}: ${appointmentPaymentStatus}`);
      return appointmentPaymentStatus;

    } catch (error) {
      console.error('❌ Error syncing payment status for appointment', appointmentId, ':', error);
      throw error;
    }
  }

  static async findByIdWithCurrentPaymentStatus(appointmentId) {
    try {
      await this.syncPaymentStatusWithPayments(appointmentId);
      return await this.findByIdWithPetDetails(appointmentId);
    } catch (error) {
      console.error('Error getting appointment with current payment status:', error);
      throw error;
    }
  }

  static async findByIdWithPaymentDetails(appointmentId) {
    try {
      const Payment = require('./Payment');

      const appointment = await this.findByIdWithPetDetails(appointmentId);
      if (!appointment) {
        return null;
      }

      const payments = await Payment.findByAppointment(appointmentId);

      appointment.payments = payments;
      appointment.has_successful_payment = payments.some(p => p.status === 'completed');
      appointment.total_paid = payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

      return appointment;

    } catch (error) {
      console.error('❌ Error getting appointment with payment details:', error);
      throw error;
    }
  }

  // NEW METHOD: Get appointment service summary
  static async getServiceSummary(appointmentId) {
    try {
      const appointment = await this.findByIdWithPetDetails(appointmentId);
      if (!appointment) return null;

      const [additionalServicesRows] = await db.execute(`
        SELECT 
          aps.service_id,
          aps.price,
          aps.payment_method,
          aps.created_at,
          gs.name,
          gs.category
        FROM appointment_services aps
        JOIN grooming_services gs ON aps.service_id = gs.id
        WHERE aps.appointment_id = ?
        ORDER BY aps.created_at ASC
      `, [appointmentId]);

      const additionalServices = additionalServicesRows.map(service => ({
        id: service.service_id,
        name: service.name,
        category: service.category,
        price: parseFloat(service.price),
        payment_method: service.payment_method,
        added_at: service.created_at
      }));

      return {
        appointment_id: appointmentId,
        primary_service: {
          id: appointment.service_id,
          name: appointment.service_name,
          base_price: parseFloat(appointment.base_price || 0)
        },
        additional_services: additionalServices,
        totals: {
          base_price: parseFloat(appointment.base_price || 0),
          matted_coat_fee: parseFloat(appointment.matted_coat_fee || 0),
          additional_services_total: additionalServices.reduce((sum, s) => sum + s.price, 0),
          total_amount: parseFloat(appointment.total_amount || 0)
        },
        counts: {
          additional_services: additionalServices.length,
          total_services: 1 + additionalServices.length
        },
        service_names: {
          primary: appointment.service_name,
          additional: additionalServices.map(s => s.name),
          combined: [appointment.service_name, ...additionalServices.map(s => s.name)].join(' + ')
        }
      };

    } catch (error) {
      console.error('❌ Error getting service summary:', error);
      throw error;
    }
  }


  // ✅ Convert 12-hour to 24-hour format
  static convertTo24Hour(time12h) {
    if (!time12h) return '';

    // If it doesn't contain AM/PM, assume it's already 24-hour
    if (!time12h.includes('AM') && !time12h.includes('PM')) {
      return time12h;
    }

    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');

    hours = parseInt(hours, 10);

    if (modifier === 'AM' && hours === 12) {
      hours = 0;
    } else if (modifier === 'PM' && hours !== 12) {
      hours += 12;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  // NEW METHOD: Add multiple services at once
  static async addMultipleServices(appointmentId, servicesData) {
    try {
      const connection = await db.getConnection();
      await connection.beginTransaction();

      const addedServices = [];
      let totalAdditionalCost = 0;

      try {
        for (const serviceData of servicesData) {
          const { service_id, pet_id, price, payment_method } = serviceData;

          const [insertResult] = await connection.execute(
            `INSERT INTO appointment_services 
             (appointment_id, service_id, pet_id, price, payment_method, created_at) 
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [appointmentId, service_id, pet_id, price, payment_method || 'cash']
          );

          addedServices.push({
            appointment_service_id: insertResult.insertId,
            service_id: service_id,
            price: price
          });

          totalAdditionalCost += parseFloat(price);
        }

        // Update total amount
        const appointment = await this.findById(appointmentId);
        const newTotal = parseFloat(appointment.total_amount) + totalAdditionalCost;

        await connection.execute(
          'UPDATE appointments SET total_amount = ?, updated_at = NOW() WHERE id = ?',
          [newTotal, appointmentId]
        );

        await connection.commit();
        connection.release();

        return {
          success: true,
          added_services: addedServices,
          total_additional_cost: totalAdditionalCost,
          new_total: newTotal
        };

      } catch (transactionError) {
        await connection.rollback();
        connection.release();
        throw transactionError;
      }

    } catch (error) {
      console.error('❌ Error adding multiple services:', error);
      throw error;
    }
  }


  // NEW METHOD: Remove service from appointment
  static async removeService(appointmentId, serviceId) {
    try {
      // Get service price before deletion
      const [serviceRows] = await db.execute(
        'SELECT price FROM appointment_services WHERE appointment_id = ? AND service_id = ?',
        [appointmentId, serviceId]
      );

      if (serviceRows.length === 0) {
        return { success: false, message: 'Service not found' };
      }

      const servicePrice = parseFloat(serviceRows[0].price);

      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // Remove the service
        await connection.execute(
          'DELETE FROM appointment_services WHERE appointment_id = ? AND service_id = ?',
          [appointmentId, serviceId]
        );

        // Update total amount
        const appointment = await this.findById(appointmentId);
        const newTotal = parseFloat(appointment.total_amount) - servicePrice;

        await connection.execute(
          'UPDATE appointments SET total_amount = ?, updated_at = NOW() WHERE id = ?',
          [newTotal, appointmentId]
        );

        await connection.commit();
        connection.release();

        return {
          success: true,
          removed_price: servicePrice,
          new_total: newTotal
        };

      } catch (transactionError) {
        await connection.rollback();
        connection.release();
        throw transactionError;
      }

    } catch (error) {
      console.error('❌ Error removing service:', error);
      throw error;
    }
  }
  static async createRescheduleHistory(appointmentId, oldDate, oldTime, newDate, newTime, reason, rescheduledBy = 'system') {
    try {
      const [result] = await db.execute(`
        INSERT INTO appointment_reschedule_history 
        (appointment_id, old_preferred_date, old_preferred_time, new_preferred_date, new_preferred_time, reason, rescheduled_by_role, rescheduled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `, [appointmentId, oldDate, oldTime, newDate, newTime, reason, rescheduledBy]);

      console.log(`✅ Reschedule history created: ID ${result.insertId} for appointment ${appointmentId}`);
      return result.insertId;
    } catch (error) {
      console.error('❌ Error creating reschedule history:', error);
      throw error;
    }
  }

  static async getStaffStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [rows] = await db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
            FROM appointments 
            WHERE preferred_date = ?
        `, [today]);

      return rows[0] || {
        total: 0,
        pending: 0,
        confirmed: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0
      };
    } catch (error) {
      console.error('Error getting staff stats:', error);
      throw error;
    }
  }

  // Add this method to your Appointment class
  static async getCancellationDetails(appointmentId) {
    try {
      const [rows] = await db.execute(`
      SELECT 
        cancelled_reason,
        cancelled_by_role,
        cancelled_by_user_id,
        cancelled_at,
        payment_status,
        status
      FROM appointments 
      WHERE id = ?
    `, [appointmentId]);

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    } catch (error) {
      console.error('Error getting cancellation details:', error);
      throw error;
    }
  }
  // NEW METHOD: Get today's active queue
  static async getTodaysQueue() {
    const today = new Date().toISOString().split('T')[0];

    const [rows] = await db.execute(`
      SELECT 
          a.id,
          a.daily_queue_number as queue_number,
          a.status,
          a.preferred_date,
          a.actual_date,
          a.preferred_time,
          a.actual_time,
          a.groomer_id,
          p.name as pet_name,
          u.name as owner_name,
          g.name as groomer_name,
          gs.name as service_name
      FROM appointments a
      LEFT JOIN pets p ON a.pet_id = p.id
      LEFT JOIN users u ON a.owner_id = u.id
      LEFT JOIN users g ON a.groomer_id = g.id
      LEFT JOIN grooming_services gs ON a.service_id = gs.id
      WHERE a.queue_date = ?
      AND a.status IN ('waiting', 'in_progress')
      ORDER BY a.daily_queue_number ASC
  `, [today]);

    return rows;
  }

  static async assignDailyQueueNumber(appointmentId, connection = null) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const dbConnection = connection || db;

      console.log(`=== QUEUE ASSIGNMENT DEBUG ===`);
      console.log(`Appointment ID: ${appointmentId}, Date: ${today}`);

      const [existing] = await dbConnection.execute(
        `SELECT id, daily_queue_number 
       FROM appointments 
       WHERE queue_date = ? AND daily_queue_number IS NOT NULL AND id != ?
       ORDER BY daily_queue_number ASC`,
        [today, appointmentId]
      );

      console.log(`Existing appointments with queue numbers:`, existing);

      let nextNumber = 1;
      console.log(`Starting with nextNumber = ${nextNumber}`);

      for (const appointment of existing) {
        console.log(`Checking appointment ${appointment.id} with queue ${appointment.daily_queue_number}`);
        if (appointment.daily_queue_number === nextNumber) {
          nextNumber++;
          console.log(`Incremented nextNumber to ${nextNumber}`);
        } else {
          console.log(`Found gap at ${nextNumber}, breaking`);
          break;
        }
      }

      console.log(`Final assigned number: ${nextNumber}`);
      console.log(`=== END DEBUG ===`);

      // Only update if no connection was passed (standalone call)
      if (!connection) {
        await dbConnection.execute(
          `UPDATE appointments 
         SET daily_queue_number = ?, queue_date = ?, updated_at = NOW()
         WHERE id = ?`,
          [nextNumber, today, appointmentId]
        );
      }

      return nextNumber;
    } catch (error) {
      console.error('Error assigning daily queue number:', error);
      throw error;
    }
  }
  static async getTodayQueue() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [queueRows] = await db.execute(`
          SELECT 
              a.id,
              a.daily_queue_number as queue_number,
              a.status,
              a.preferred_date,
              a.actual_date,
              a.preferred_time,
              a.actual_time,
              a.groomer_id,
              p.name as pet_name,
              u.name as owner_name,
              g.name as groomer_name
          FROM appointments a
          LEFT JOIN pets p ON a.pet_id = p.id
          LEFT JOIN users u ON a.owner_id = u.id
          LEFT JOIN users g ON a.groomer_id = g.id
          WHERE a.queue_date = ?
          AND a.status IN ('waiting', 'in_progress')
          ORDER BY a.daily_queue_number ASC
      `, [today]);

      return queueRows;
    } catch (error) {
      console.error('Error fetching today queue:', error);
      throw error;
    }
  }

}

module.exports = Appointment;