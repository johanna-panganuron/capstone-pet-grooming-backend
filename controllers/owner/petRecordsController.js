// controllers/owner/petRecordsController.js
const db = require('../../models/db');
const { ActivityLogger } = require('../../utils/activityLogger');
 
exports.getPetGroomingHistory = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate pet ID
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pet ID provided'
      });
    }

    // First verify the pet exists and user has permission
    const petQuery = `
      SELECT p.id, p.name, p.user_id, u.name as owner_name
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;
    
    const [petCheck] = await db.query(petQuery, [id]);
    
    if (petCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pet not found'
      });
    }

    const pet = petCheck[0];

    // Get appointment history with ALL services (main + add-ons)
    const appointmentHistoryQuery = `
      SELECT 
        a.id as appointment_id,
        a.preferred_date as service_date,
        a.preferred_time as service_time,
        a.actual_date,
        a.actual_time,
        a.status,
        a.total_amount,
        a.payment_status,
        a.payment_method,
        a.special_notes,
        a.before_image,
        a.after_image,
        a.has_images,
        a.created_at,
        a.updated_at,
        
        -- Main service info
        gs.name as service_name,
        gs.description as service_description,
        gs.category as service_category,
        
        -- Groomer info
        groomer.name as groomer_name,
        groomer.id as groomer_id,
        
        -- Rating info
        r.rating,
        r.review,
        'appointment' as booking_type,
        
        -- Aggregate all services for this appointment
        GROUP_CONCAT(
          DISTINCT CONCAT(
            service_gs.name, 
            IF(appt_services.price > 0, CONCAT(' (₱', appt_services.price, ')'), '')
          ) 
          ORDER BY service_gs.name 
          SEPARATOR ', '
        ) as all_services
        
      FROM appointments a
      INNER JOIN grooming_services gs ON a.service_id = gs.id
      LEFT JOIN appointment_services appt_services ON a.id = appt_services.appointment_id
      LEFT JOIN grooming_services service_gs ON appt_services.service_id = service_gs.id
      LEFT JOIN users groomer ON a.groomer_id = groomer.id AND groomer.role IN ('staff', 'owner') AND groomer.staff_type = 'Groomer'
      LEFT JOIN ratings r ON a.id = r.appointment_id
      WHERE a.pet_id = ?
      GROUP BY a.id, a.preferred_date, a.preferred_time, a.actual_date, a.actual_time, 
               a.status, a.total_amount, a.payment_status, a.payment_method, a.special_notes,
               a.before_image, a.after_image, a.has_images, a.created_at, a.updated_at,
               gs.name, gs.description, gs.category, groomer.name, groomer.id, r.rating, r.review
      ORDER BY COALESCE(a.actual_date, a.preferred_date) DESC, COALESCE(a.actual_time, a.preferred_time) DESC
    `;

    // Get walk-in history with ALL services (main + add-ons)
    const walkInHistoryQuery = `
      SELECT 
        wb.id as appointment_id,
        DATE(wb.created_at) as service_date,
        wb.time_slot as service_time,
        DATE(wb.created_at) as actual_date,
        wb.time_slot as actual_time,
        wb.status,
        wb.total_amount,
        wb.payment_status,
        wb.payment_method,
        wb.special_notes,
        wb.before_photo as before_image,
        wb.after_photo as after_image,
        wb.has_photos as has_images,
        wb.created_at,
        wb.updated_at,
        
        -- Main service info
        gs.name as service_name,
        gs.description as service_description,
        gs.category as service_category,
        
        -- Groomer info
        groomer.name as groomer_name,
        groomer.id as groomer_id,
        
        -- Rating info
        wr.rating,
        wr.review,
        'walk_in' as booking_type,
        
        -- Aggregate all services for this walk-in booking
        GROUP_CONCAT(
          DISTINCT CONCAT(
            service_gs.name,
            IF(wb_services.price > 0, CONCAT(' (₱', wb_services.price, ')'), '')
          ) 
          ORDER BY service_gs.name 
          SEPARATOR ', '
        ) as all_services
        
      FROM walk_in_bookings wb
      INNER JOIN grooming_services gs ON wb.service_id = gs.id
      LEFT JOIN walk_in_booking_services wb_services ON wb.id = wb_services.walk_in_booking_id
      LEFT JOIN grooming_services service_gs ON wb_services.service_id = service_gs.id
      LEFT JOIN users groomer ON wb.groomer_id = groomer.id AND groomer.role IN ('staff', 'owner') AND groomer.staff_type = 'Groomer'
      LEFT JOIN walk_in_ratings wr ON wb.id = wr.walk_in_booking_id
      WHERE wb.pet_id = ?
      GROUP BY wb.id, wb.created_at, wb.time_slot, wb.status, wb.total_amount, wb.payment_status,
               wb.payment_method, wb.special_notes, wb.before_photo, wb.after_photo, wb.has_photos,
               wb.updated_at, gs.name, gs.description, gs.category, groomer.name, groomer.id, wr.rating, wr.review
      ORDER BY wb.created_at DESC
    `;

    const [appointmentHistory] = await db.query(appointmentHistoryQuery, [id]);
    const [walkInHistory] = await db.query(walkInHistoryQuery, [id]);

    // Combine and sort by date
    const allHistory = [...appointmentHistory, ...walkInHistory].sort((a, b) => {
      const dateA = new Date(a.actual_date || a.service_date);
      const dateB = new Date(b.actual_date || b.service_date);
      return dateB - dateA;
    });

    // Format the response with enhanced service information
    const groomingHistory = allHistory.map(record => ({
      id: record.appointment_id,
      booking_type: record.booking_type,
      service_date: record.actual_date || record.service_date,
      service_time: record.actual_time || record.service_time,
      service_name: record.service_name,
      service_description: record.service_description,
      service_category: record.service_category,
      all_services: record.all_services || record.service_name, // Show all services or fallback to main service
      groomer: {
        id: record.groomer_id,
        name: record.groomer_name || 'Not assigned'
      },
      status: record.status,
      total_amount: record.total_amount,
      payment_status: record.payment_status,
      payment_method: record.payment_method,
      special_notes: record.special_notes,
      before_image: record.before_image,
      after_image: record.after_image,
      has_images: record.has_images,
      rating: record.rating,
      review: record.review,
      created_at: record.created_at,
      updated_at: record.updated_at
    }));

    // Enhanced favorite services calculation - including add-ons
    const favoriteServicesQuery = `
    SELECT service_name, service_count, service_category, image_url FROM (
      -- Appointment services (main + add-ons)
      SELECT 
        gs.name as service_name,
        gs.category as service_category,
        gs.image_url as image_url,
        COUNT(*) as service_count
      FROM appointments a
      INNER JOIN grooming_services gs ON a.service_id = gs.id
      WHERE a.pet_id = ? AND a.status = 'completed'
      GROUP BY gs.id, gs.name, gs.category, gs.image_url
      
      UNION ALL
      
      SELECT 
        gs.name as service_name,
        gs.category as service_category,
        gs.image_url as image_url,
        COUNT(*) as service_count
      FROM appointments a
      INNER JOIN appointment_services as_srv ON a.id = as_srv.appointment_id
      INNER JOIN grooming_services gs ON as_srv.service_id = gs.id
      WHERE a.pet_id = ? AND a.status = 'completed'
      GROUP BY gs.id, gs.name, gs.category, gs.image_url
      
      UNION ALL
      
      -- Walk-in services (main + add-ons)
      SELECT 
        gs.name as service_name,
        gs.category as service_category,
        gs.image_url as image_url,
        COUNT(*) as service_count
      FROM walk_in_bookings wb
      INNER JOIN grooming_services gs ON wb.service_id = gs.id
      WHERE wb.pet_id = ? AND wb.status = 'completed'
      GROUP BY gs.id, gs.name, gs.category, gs.image_url
      
      UNION ALL
      
      SELECT 
        gs.name as service_name,
        gs.category as service_category,
        gs.image_url as image_url,
        COUNT(*) as service_count
      FROM walk_in_bookings wb
      INNER JOIN walk_in_booking_services wb_srv ON wb.id = wb_srv.walk_in_booking_id
      INNER JOIN grooming_services gs ON wb_srv.service_id = gs.id
      WHERE wb.pet_id = ? AND wb.status = 'completed'
      GROUP BY gs.id, gs.name, gs.category, gs.image_url
    ) combined_services
    GROUP BY service_name, service_category, image_url
    ORDER BY SUM(service_count) DESC, service_name ASC
    LIMIT 5
  `;

    const [favoriteServicesResult] = await db.query(favoriteServicesQuery, [id, id, id, id]);

    // Get summary statistics
    const stats = {
      total_sessions: groomingHistory.length,
      completed_sessions: groomingHistory.filter(h => h.status === 'completed').length,
      total_spent: groomingHistory
        .filter(h => h.status === 'completed' && h.payment_status === 'paid')
        .reduce((sum, h) => sum + parseFloat(h.total_amount || 0), 0),
      last_visit: groomingHistory.length > 0 ? groomingHistory[0].service_date : null,
      favorite_services: favoriteServicesResult.reduce((acc, service) => {
        acc[service.service_name] = {
          count: service.service_count,
          category: service.service_category,
          image_url: service.image_url
        };
        return acc;
      }, {}),
      average_rating: groomingHistory
        .filter(h => h.rating)
        .reduce((sum, h, _, arr) => sum + h.rating / arr.length, 0) || null
    };

    res.status(200).json({
      success: true,
      message: 'Pet grooming history retrieved successfully',
      pet: {
        id: pet.id,
        name: pet.name,
        owner_name: pet.owner_name
      },
      history: groomingHistory,
      stats: stats
    });

  } catch (err) {
    console.error('Get pet grooming history error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
// Add this new method to search for pet owners
exports.searchPetOwners = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(200).json({
        success: true,
        owners: []
      });
    }

    const query = `
      SELECT 
        id,
        name,
        email,
        contact_number
      FROM users 
      WHERE role = 'pet_owner' 
      AND (name LIKE ? OR email LIKE ?)
      ORDER BY name ASC
      LIMIT 10
    `;

    const searchTerm = `%${q}%`;
    const [rows] = await db.query(query, [searchTerm, searchTerm]);

    res.status(200).json({
      success: true,
      owners: rows
    });

  } catch (err) {
    console.error('Search pet owners error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error'
    });
  }
};
// Add this method to handle pet creation
exports.createPet = async (req, res) => {
  try {
    const { name, type, breed, gender, birth_date, weight, size, user_id } = req.body;
    
    // Handle photo upload if present
    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/pets/${req.file.filename}`;
    }

    // Calculate age from birth_date
    let age = null;
    if (birth_date) {
      const birthDate = new Date(birth_date);
      const today = new Date();
      const diffTime = today - birthDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 365) {
        age = Math.floor(diffDays / 365);
      } else if (diffDays >= 30) {
        age = Math.floor(diffDays / 30);
      } else {
        age = diffDays;
      }
    }

    const insertQuery = `
      INSERT INTO pets (
        name, type, breed, gender, birth_date, weight, size, 
        photo_url, user_id, age, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const [result] = await db.query(insertQuery, [
      name, type, breed || null, gender, birth_date || null, 
      weight || null, size || null, photoUrl, user_id, age
    ]);

    // Fetch the created pet with owner info
    const selectQuery = `
      SELECT 
        p.id as pet_id,
        p.name as pet_name,
        p.breed,
        p.weight,
        p.size,
        p.birth_date,
        p.age,
        p.type as species,
        p.gender,
        p.photo_url as pet_photo_url,
        p.created_at as pet_registered_date,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;

    const [petRows] = await db.query(selectQuery, [result.insertId]);
    const petRecord = petRows[0];

    const response = {
      pet_id: petRecord.pet_id,
      pet_name: petRecord.pet_name,
      breed: petRecord.breed || 'Mixed/Unknown',
      species: petRecord.species,
      gender: petRecord.gender,
      weight: petRecord.weight ? `${petRecord.weight} kg` : 'Not specified',
      size: petRecord.size || 'Not specified',
      birth_date: petRecord.birth_date,
      age: petRecord.age || 'Unknown',
      pet_photo_url: petRecord.pet_photo_url,
      pet_registered_date: petRecord.pet_registered_date,
      owner: {
        id: petRecord.owner_id,
        name: petRecord.owner_name,
        email: petRecord.owner_email,
        contact_number: petRecord.owner_contact
      }
    };
// After building `response`
await ActivityLogger.log(
  req.user,
  'pet_create',
  'pet',
  name,
  `Created pet: ${name} (${type}) for owner ${user_id}`,
  req
);
    res.status(201).json({
      success: true,
      message: 'Pet created successfully',
      pet: response
    });

  } catch (err) {
    console.error('Create pet error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Add this to your petRecordsController.js
// ✅ Update Pet Record (Corrected with debugging)
exports.updatePet = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, breed, gender, birth_date, weight, size, user_id } = req.body;
    
    console.log('Update pet request received:');
    console.log('Pet ID:', id);
    console.log('Request body:', req.body);
    console.log('File uploaded:', req.file ? req.file.filename : 'No file');
    
    // Validate pet ID
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pet ID provided'
      });
    }

    // First, verify the pet exists
    const checkQuery = `
      SELECT p.*, u.role 
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND u.role = 'pet_owner'
    `;
    
    const [existingPet] = await db.query(checkQuery, [id]);
    
    if (existingPet.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pet record not found or access denied'
      });
    }

    console.log('Existing pet found:', existingPet[0].name);

    // Handle photo upload if present
    let photoUrl = existingPet[0].photo_url; // Keep existing photo by default
    if (req.file) {
      photoUrl = `/uploads/pets/${req.file.filename}`;
      console.log('New photo uploaded:', photoUrl);
    }

    // Calculate age from birth_date
    let age = null;
    if (birth_date) {
      const birthDate = new Date(birth_date);
      const today = new Date();
      const diffTime = today - birthDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays >= 365) {
        age = Math.floor(diffDays / 365);
      } else if (diffDays >= 30) {
        age = Math.floor(diffDays / 30);
      } else {
        age = diffDays;
      }
      console.log('Calculated age:', age);
    }

    // Validate required fields
    if (!name || !type || !gender || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, type, gender, or user_id'
      });
    }

    const updateQuery = `
      UPDATE pets SET 
        name = ?, 
        type = ?, 
        breed = ?, 
        gender = ?, 
        birth_date = ?, 
        weight = ?, 
        size = ?,
        photo_url = ?,
        user_id = ?,
        age = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    const updateParams = [
      name, 
      type, 
      breed || null, 
      gender, 
      birth_date || null, 
      weight || null, 
      size || null, 
      photoUrl,
      user_id,
      age,
      id
    ];

    console.log('Update query params:', updateParams);

    const [updateResult] = await db.query(updateQuery, updateParams);
    
    if (updateResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pet not found or no changes made'
      });
    }

    console.log('Pet updated successfully, affected rows:', updateResult.affectedRows);

    // Fetch the updated pet with owner info
    const selectQuery = `
      SELECT 
        p.id as pet_id,
        p.name as pet_name,
        p.breed,
        p.weight,
        p.size,
        p.birth_date,
        p.age,
        p.type as species,
        p.gender,
        p.photo_url as pet_photo_url,
        p.created_at as pet_registered_date,
        p.updated_at as pet_updated_date,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;

    const [petRows] = await db.query(selectQuery, [id]);
    
    if (petRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Updated pet not found'
      });
    }

    const petRecord = petRows[0];

    const response = {
      pet_id: petRecord.pet_id,
      pet_name: petRecord.pet_name,
      breed: petRecord.breed || 'Mixed/Unknown',
      species: petRecord.species,
      gender: petRecord.gender,
      weight: petRecord.weight ? `${petRecord.weight} kg` : 'Not specified',
      size: petRecord.size || 'Not specified',
      birth_date: petRecord.birth_date,
      age: petRecord.age || 'Unknown',
      pet_photo_url: petRecord.pet_photo_url,
      pet_registered_date: petRecord.pet_registered_date,
      pet_updated_date: petRecord.pet_updated_date,
      owner: {
        id: petRecord.owner_id,
        name: petRecord.owner_name,
        email: petRecord.owner_email,
        contact_number: petRecord.owner_contact
      }
    };

    console.log('Sending response:', response);
    await ActivityLogger.log(
      req.user,
      'pet_update',
      'pet',
      name,
      `Updated pet: ${name} (ID: ${id})`,
      req
    );
    res.status(200).json({
      success: true,
      message: 'Pet updated successfully',
      pet: response
    });

  } catch (err) {
    console.error('Update pet error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
// ✅ Get All Pet Records for Owner Dashboard
// Replace the existing getAllPetRecords method with this updated version:

exports.getAllPetRecords = async (req, res) => {
  try {
    // Step 1: Get basic pet data
    const petQuery = `
      SELECT 
        p.id as pet_id,
        p.name as pet_name,
        p.breed,
        p.weight,
        p.size,
        p.birth_date,
        p.age,
        p.type as species,
        p.gender,
        p.photo_url as pet_photo_url,
        p.created_at as pet_registered_date,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact,
        u.profile_photo_url as owner_photo_url
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner'
      ORDER BY p.created_at DESC
    `;

    const [petRows] = await db.query(petQuery);

    // Step 2: For each pet, get their last COMPLETED grooming session only
    const petRecordsWithLastVisit = [];
    
    for (const pet of petRows) {
      let lastVisit = null;
      
      try {
        // Check appointments - ONLY COMPLETED STATUS
        const appointmentQuery = `
          SELECT COALESCE(actual_date, preferred_date) as visit_date
          FROM appointments 
          WHERE pet_id = ? AND status = 'completed'
          ORDER BY COALESCE(actual_date, preferred_date) DESC 
          LIMIT 1
        `;
        
        const [appointmentRows] = await db.query(appointmentQuery, [pet.pet_id]);
        
        // Check walk-in bookings - ONLY COMPLETED STATUS
        const walkInQuery = `
          SELECT DATE(created_at) as visit_date
          FROM walk_in_bookings 
          WHERE pet_id = ? AND status = 'completed'
          ORDER BY created_at DESC 
          LIMIT 1
        `;
        
        const [walkInRows] = await db.query(walkInQuery, [pet.pet_id]);
        
        // Determine the most recent COMPLETED visit
        const appointments = appointmentRows.length > 0 ? new Date(appointmentRows[0].visit_date) : null;
        const walkIns = walkInRows.length > 0 ? new Date(walkInRows[0].visit_date) : null;
        
        if (appointments && walkIns) {
          lastVisit = appointments > walkIns ? appointmentRows[0].visit_date : walkInRows[0].visit_date;
        } else if (appointments) {
          lastVisit = appointmentRows[0].visit_date;
        } else if (walkIns) {
          lastVisit = walkInRows[0].visit_date;
        }
        
        console.log(`Pet ${pet.pet_name} (ID: ${pet.pet_id}) - Last completed visit:`, lastVisit);
        
      } catch (visitError) {
        console.error(`Error getting last completed visit for pet ${pet.pet_id}:`, visitError);
        lastVisit = null;
      }

      // Build the pet record
      const petRecord = {
        pet_id: pet.pet_id,
        pet_name: pet.pet_name,
        breed: pet.breed || 'Mixed/Unknown',
        species: pet.species,
        gender: pet.gender,
        weight: pet.weight ? `${pet.weight} kg` : 'Not specified',
        size: pet.size || 'Not specified',
        birth_date: pet.birth_date,
        age: pet.age || 'Unknown',
        pet_photo_url: pet.pet_photo_url,
        pet_registered_date: pet.pet_registered_date,
        last_visit: lastVisit, // Only set if there's a completed visit
        owner: {
          id: pet.owner_id,
          name: pet.owner_name,
          email: pet.owner_email,
          contact_number: pet.owner_contact,
          profile_photo_url: pet.owner_photo_url
        }
      };
      
      petRecordsWithLastVisit.push(petRecord);
    }

    console.log('Final pet records with last completed visit:', petRecordsWithLastVisit);

    res.status(200).json({
      success: true,
      message: 'Pet records retrieved successfully',
      pets: petRecordsWithLastVisit,
      total_count: petRecordsWithLastVisit.length
    });

  } catch (err) {
    console.error('Get all pet records error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Get Pet Record by ID with detailed information
exports.getPetRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        p.id as pet_id,
        p.name as pet_name,
        p.breed,
        p.weight,
        p.size,
        p.birth_date,
        p.age,
        p.type as species,
        p.gender,
        p.photo_url as pet_photo_url,
        p.created_at as pet_registered_date,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact,
        u.profile_photo_url as owner_photo_url,
        u.created_at as owner_registered_date
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND u.role = 'pet_owner'
    `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pet record not found'
      });
    }

    const record = rows[0];

    // Get pet's appointment history if appointments table exists
    let appointmentHistory = [];
    try {
      const appointmentQuery = `
        SELECT 
          id,
          service_type,
          appointment_date,
          appointment_time,
          status,
          total_amount,
          notes,
          created_at
        FROM appointments 
        WHERE pet_id = ?
        ORDER BY appointment_date DESC, appointment_time DESC
        LIMIT 10
      `;
      
      const [appointments] = await db.query(appointmentQuery, [id]);
      appointmentHistory = appointments;
    } catch (appointmentError) {
      console.log('No appointments table found or error fetching appointments:', appointmentError.message);
    }

    const petRecord = {
      pet_id: record.pet_id,
      pet_name: record.pet_name,
      breed: record.breed || 'Mixed/Unknown',
      species: record.species,
      gender: record.gender,
      weight: record.weight ? `${record.weight} kg` : 'Not specified',
      size: record.size || 'Not specified',
      birth_date: record.birth_date,
      age: record.age || 'Unknown',
      pet_photo_url: record.pet_photo_url,
      pet_registered_date: record.pet_registered_date,
      owner: {
        id: record.owner_id,
        name: record.owner_name,
        email: record.owner_email,
        contact_number: record.owner_contact,
        profile_photo_url: record.owner_photo_url,
        registered_date: record.owner_registered_date
      },
      appointment_history: appointmentHistory
    };

    res.status(200).json({
      success: true,
      message: 'Pet record retrieved successfully',
      pet: petRecord
    });

  } catch (err) {
    console.error('Get pet record by ID error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Get Pet Records Statistics for Dashboard
exports.getPetRecordsStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(p.id) as total_pets,
        COUNT(DISTINCT p.user_id) as total_pet_owners,
        COUNT(CASE WHEN p.type = 'Dog' THEN 1 END) as total_dogs,
        COUNT(CASE WHEN p.type = 'Cat' THEN 1 END) as total_cats,
        COUNT(CASE WHEN p.type = 'Bird' THEN 1 END) as total_birds,
        COUNT(CASE WHEN p.type = 'Other' THEN 1 END) as total_others,
        COUNT(CASE WHEN p.gender = 'Male' THEN 1 END) as total_males,
        COUNT(CASE WHEN p.gender = 'Female' THEN 1 END) as total_females,
        COUNT(CASE WHEN DATE(p.created_at) = CURDATE() THEN 1 END) as new_today,
        COUNT(CASE WHEN DATE(p.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as new_this_week,
        COUNT(CASE WHEN DATE(p.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as new_this_month
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner'
    `;

    const [stats] = await db.query(statsQuery);

    // Get size distribution
    const sizeStatsQuery = `
      SELECT 
        p.size,
        COUNT(*) as count
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner' AND p.size IS NOT NULL
      GROUP BY p.size
      ORDER BY count DESC
    `;

    const [sizeStats] = await db.query(sizeStatsQuery);

    res.status(200).json({
      success: true,
      message: 'Pet records statistics retrieved successfully',
      stats: {
        ...stats[0],
        size_distribution: sizeStats
      }
    });

  } catch (err) {
    console.error('Get pet records stats error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Search Pet Records
exports.searchPetRecords = async (req, res) => {
  try {
    const { query: searchQuery, type, size, gender } = req.query;

    let whereConditions = ["u.role = 'pet_owner'"];
    let queryParams = [];

    // Add search conditions
    if (searchQuery) {
      whereConditions.push("(p.name LIKE ? OR p.breed LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
      const searchTerm = `%${searchQuery}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (type) {
      whereConditions.push("p.type = ?");
      queryParams.push(type);
    }

    if (size) {
      whereConditions.push("p.size = ?");
      queryParams.push(size);
    }

    if (gender) {
      whereConditions.push("p.gender = ?");
      queryParams.push(gender);
    }

    const query = `
      SELECT 
        p.id as pet_id,
        p.name as pet_name,
        p.breed,
        p.weight,
        p.size,
        p.birth_date,
        p.age,
        p.type as species,
        p.gender,
        p.photo_url as pet_photo_url,
        p.created_at as pet_registered_date,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact,
        u.profile_photo_url as owner_photo_url
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.created_at DESC
    `;

    const [rows] = await db.query(query, queryParams);

    const petRecords = rows.map(record => ({
      pet_id: record.pet_id,
      pet_name: record.pet_name,
      breed: record.breed || 'Mixed/Unknown',
      species: record.species,
      gender: record.gender,
      weight: record.weight ? `${record.weight} kg` : 'Not specified',
      size: record.size || 'Not specified',
      birth_date: record.birth_date,
      age: record.age || 'Unknown',
      pet_photo_url: record.pet_photo_url,
      pet_registered_date: record.pet_registered_date,
      owner: {
        id: record.owner_id,
        name: record.owner_name,
        email: record.owner_email,
        contact_number: record.owner_contact,
        profile_photo_url: record.owner_photo_url
      }
    }));

    res.status(200).json({
      success: true,
      message: 'Pet records search completed',
      pets: petRecords,
      total_count: petRecords.length,
      search_criteria: { query: searchQuery, type, size, gender }
    });

  } catch (err) {
    console.error('Search pet records error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};
// Enhanced deletePet with extensive debugging
// Fixed deletePet for Owner Controller - Admin can delete any pet
exports.deletePet = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Debug: Log all incoming data
    console.log('=== DELETE PET REQUEST ===');
    console.log('Pet ID from params:', id);
    console.log('Full req.user object:', JSON.stringify(req.user, null, 2));
    console.log('Request method:', req.method);
    console.log('Request path:', req.path);
    
    // Validate pet ID
    if (!id || isNaN(id)) {
      console.log('❌ Invalid pet ID');
      return res.status(400).json({
        success: false,
        message: 'Invalid pet ID provided'
      });
    }

    // Check if user exists in request
    if (!req.user) {
      console.log('❌ No user found in request');
      return res.status(401).json({
        success: false,
        message: 'User authentication failed'
      });
    }

    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log('User ID:', userId, 'User Role:', userRole);

    // Get pet details with owner info
    const petQuery = `
      SELECT 
        p.id, p.name, p.user_id,
        u.name as owner_name, u.email as owner_email, u.role as owner_role
      FROM pets p 
      INNER JOIN users u ON p.user_id = u.id 
      WHERE p.id = ?
    `;
    
    const [petCheck] = await db.query(petQuery, [id]);
    
    console.log('Pet exists check - found:', petCheck.length, 'pets');
    
    if (petCheck.length === 0) {
      console.log('❌ Pet not found in database');
      return res.status(404).json({
        success: false,
        message: 'Pet record not found'
      });
    }

    const pet = petCheck[0];
    console.log('Found pet:', JSON.stringify(pet, null, 2));

    // Permission logic:
    // 1. If user is 'owner' (admin/business owner) - can delete any pet
    // 2. If user is 'pet_owner' - can only delete their own pets
    let canDelete = false;
    let deleteReason = '';

    if (userRole === 'owner') {
      canDelete = true;
      deleteReason = 'Admin/Owner privileges';
      console.log('✅ Admin/Owner can delete any pet');
    } else if (userRole === 'pet_owner' && pet.user_id === userId) {
      canDelete = true;
      deleteReason = 'Pet owner deleting own pet';
      console.log('✅ Pet owner deleting own pet');
    } else {
      canDelete = false;
      deleteReason = `User role '${userRole}' cannot delete pet owned by user ${pet.user_id}`;
      console.log('❌ Permission denied:', deleteReason);
    }

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this pet record',
        debug: {
          petOwnerId: pet.user_id,
          requestUserId: userId,
          userRole: userRole,
          reason: deleteReason
        }
      });
    }

    console.log('✅ Permission granted - proceeding with deletion');
    console.log('Delete reason:', deleteReason);

    // Delete the pet (no ownership restriction for admins)
    console.log('Executing DELETE query...');
    const deleteQuery = `DELETE FROM pets WHERE id = ?`;
    const [deleteResult] = await db.query(deleteQuery, [id]);
    
    console.log('Delete result:', JSON.stringify(deleteResult, null, 2));
    console.log('Affected rows:', deleteResult.affectedRows);
    
    if (deleteResult.affectedRows === 0) {
      console.log('❌ No rows affected during deletion');
      return res.status(404).json({
        success: false,
        message: 'Pet record could not be deleted - no rows affected'
      });
    }

    console.log('✅ Pet deleted successfully');

    // Different success messages based on who deleted it
    let successMessage = '';
    if (userRole === 'owner') {
      successMessage = `Pet "${pet.name}" owned by "${pet.owner_name}" has been deleted by admin`;
    } else {
      successMessage = `Pet "${pet.name}" deleted successfully`;
    }
    await ActivityLogger.log(
      req.user,
      'pet_delete',
      'pet',
      pet.name,
      `Deleted pet: ${pet.name} (ID: ${id}) owned by ${pet.owner_name}`,
      req
    );
    res.status(200).json({
      success: true,
      message: successMessage,
      debug: {
        deletedPetId: id,
        affectedRows: deleteResult.affectedRows,
        deletedBy: userRole,
        deleteReason: deleteReason
      }
    });

  } catch (err) {
    console.error('❌ Delete pet error:', err);
    console.error('Error stack:', err.stack);
    
    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        stack: err.stack
      } : undefined
    });
  }
};