// controllers/staff/petRecordsController.js
const db = require('../../models/db');
const { ActivityLogger } = require('../../utils/activityLogger');

const getLastGroomedDate = async (petId) => {
  try {
    // Get the most recent completed grooming from both appointments and walk-in bookings
    const lastGroomingQuery = `
      SELECT 
        MAX(grooming_date) as last_groomed
      FROM (
        SELECT 
          COALESCE(actual_date, preferred_date) as grooming_date
        FROM appointments 
        WHERE pet_id = ? AND status = 'completed'
        
        UNION ALL
        
        SELECT 
          DATE(created_at) as grooming_date
        FROM walk_in_bookings 
        WHERE pet_id = ? AND status = 'completed'
      ) AS all_groomings
    `;
    
    const [result] = await db.query(lastGroomingQuery, [petId, petId]);
    return result[0]?.last_groomed || null;
  } catch (error) {
    console.error('Error fetching last groomed date:', error);
    return null;
  }
};


// Add this method to search for pet owners
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

    // Log the search activity
    await ActivityLogger.log(
      req.user,
      'SEARCHED',
      'PET_OWNERS',
      `Pet owners with query: "${q}"`,
      `Found ${rows.length} matching pet owners`,
      req
    );

    res.status(200).json({
      success: true,
      owners: rows
    });

  } catch (err) {
    console.error('Staff search pet owners error:', err);
    
    // Log the error
    await ActivityLogger.log(
      req.user,
      'SEARCH_FAILED',
      'PET_OWNERS',
      `Pet owners search: "${req.query.q || 'N/A'}"`,
      `Error: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error'
    });
  }
};

// Add this method to handle pet creation by staff
exports.createPet = async (req, res) => {
  try {
    const { name, type, breed, gender, birth_date, weight, size, user_id } = req.body;
    
    // Validate that user_id corresponds to a pet owner
    const ownerCheckQuery = `SELECT id, name FROM users WHERE id = ? AND role = 'pet_owner'`;
    const [ownerCheck] = await db.query(ownerCheckQuery, [user_id]);
    
    if (ownerCheck.length === 0) {
      // Log failed attempt
      await ActivityLogger.log(
        req.user,
        'CREATE_FAILED',
        'PET',
        name || 'Unknown Pet',
        `Failed to create pet - Invalid owner ID: ${user_id}`,
        req
      );

      return res.status(400).json({
        success: false,
        message: 'Invalid pet owner selected'
      });
    }
    
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
        age = `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
      } else if (diffDays >= 30) {
        age = `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''}`;
      } else {
        age = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
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

    // Log successful pet creation
    await ActivityLogger.log(
      req.user,
      'CREATED',
      'PET',
      petRecord.pet_name,
      `Created pet for owner: ${ownerCheck[0].name} | Species: ${type} | Breed: ${breed || 'Mixed/Unknown'} | Gender: ${gender} | ${photoUrl ? 'With photo' : 'No photo'}`,
      req
    );

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
      },
      created_by_staff: req.user.id
    };

    res.status(201).json({
      success: true,
      message: 'Pet created successfully by staff',
      pet: response
    });

  } catch (err) {
    console.error('Staff create pet error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'CREATE_FAILED',
      'PET',
      req.body.name || 'Unknown Pet',
      `Error creating pet: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Update pet record by staff
exports.updatePet = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, breed, gender, birth_date, weight, size } = req.body;
    
    // Check if pet exists and get current details
    const petCheckQuery = `
      SELECT p.id, p.name, p.type, p.breed, p.gender, p.weight, p.size, p.birth_date, u.name as owner_name 
      FROM pets p 
      INNER JOIN users u ON p.user_id = u.id 
      WHERE p.id = ?
    `;
    const [petCheck] = await db.query(petCheckQuery, [id]);
    
    if (petCheck.length === 0) {
      // Log failed attempt
      await ActivityLogger.log(
        req.user,
        'UPDATE_FAILED',
        'PET',
        `Pet ID: ${id}`,
        'Failed to update pet - Pet not found',
        req
      );

      return res.status(404).json({
        success: false,
        message: 'Pet not found'
      });
    }

    const currentPet = petCheck[0];
    
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
        age = `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
      } else if (diffDays >= 30) {
        age = `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''}`;
      } else {
        age = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
      }
    }

    // Build update query dynamically and track changes
    let updateFields = [];
    let updateValues = [];
    let changes = [];

    if (name && name !== currentPet.name) {
      updateFields.push('name = ?');
      updateValues.push(name);
      changes.push(`Name: "${currentPet.name}" → "${name}"`);
    }
    if (type && type !== currentPet.type) {
      updateFields.push('type = ?');
      updateValues.push(type);
      changes.push(`Type: "${currentPet.type}" → "${type}"`);
    }
    if (breed !== undefined && breed !== currentPet.breed) {
      updateFields.push('breed = ?');
      updateValues.push(breed);
      changes.push(`Breed: "${currentPet.breed || 'None'}" → "${breed || 'None'}"`);
    }
    if (gender && gender !== currentPet.gender) {
      updateFields.push('gender = ?');
      updateValues.push(gender);
      changes.push(`Gender: "${currentPet.gender}" → "${gender}"`);
    }
    if (birth_date !== undefined && birth_date !== currentPet.birth_date) {
      updateFields.push('birth_date = ?');
      updateValues.push(birth_date);
      changes.push(`Birth Date: "${currentPet.birth_date || 'None'}" → "${birth_date || 'None'}"`);
    }
    if (weight !== undefined && weight !== currentPet.weight) {
      updateFields.push('weight = ?');
      updateValues.push(weight);
      changes.push(`Weight: "${currentPet.weight || 'None'}" → "${weight || 'None'}"`);
    }
    if (size !== undefined && size !== currentPet.size) {
      updateFields.push('size = ?');
      updateValues.push(size);
      changes.push(`Size: "${currentPet.size || 'None'}" → "${size || 'None'}"`);
    }
    if (photoUrl) {
      updateFields.push('photo_url = ?');
      updateValues.push(photoUrl);
      changes.push('Photo: Updated');
    }
    if (age) {
      updateFields.push('age = ?');
      updateValues.push(age);
      changes.push(`Age: Updated to "${age}"`);
    }

    if (updateFields.length === 0) {
      // Log no changes attempt
      await ActivityLogger.log(
        req.user,
        'UPDATE_ATTEMPTED',
        'PET',
        currentPet.name,
        'No changes detected in update request',
        req
      );

      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    const updateQuery = `UPDATE pets SET ${updateFields.join(', ')} WHERE id = ?`;
    await db.query(updateQuery, updateValues);

    // Log successful update
    await ActivityLogger.log(
      req.user,
      'UPDATED',
      'PET',
      currentPet.name,
      `Updated pet owned by ${currentPet.owner_name} | Changes: ${changes.join(', ')}`,
      req
    );

    // Fetch updated pet record
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
        p.updated_at,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ?
    `;

    const [petRows] = await db.query(selectQuery, [id]);
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
      updated_at: petRecord.updated_at,
      owner: {
        id: petRecord.owner_id,
        name: petRecord.owner_name,
        email: petRecord.owner_email,
        contact_number: petRecord.owner_contact
      },
      updated_by_staff: req.user.id
    };

    res.status(200).json({
      success: true,
      message: 'Pet updated successfully',
      pet: response
    });

  } catch (err) {
    console.error('Staff update pet error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'UPDATE_FAILED',
      'PET',
      `Pet ID: ${req.params.id}`,
      `Error updating pet: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Delete pet record by staff
exports.deletePet = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if pet exists and get pet info
    const petQuery = `
      SELECT p.name, p.type, p.breed, u.name as owner_name, u.email as owner_email
      FROM pets p 
      INNER JOIN users u ON p.user_id = u.id 
      WHERE p.id = ?
    `;
    const [petCheck] = await db.query(petQuery, [id]);
    
    if (petCheck.length === 0) {
      // Log failed attempt
      await ActivityLogger.log(
        req.user,
        'DELETE_FAILED',
        'PET',
        `Pet ID: ${id}`,
        'Failed to delete pet - Pet not found',
        req
      );

      return res.status(404).json({
        success: false,
        message: 'Pet not found'
      });
    }

    const petInfo = petCheck[0];

    // Delete the pet
    const deleteQuery = `DELETE FROM pets WHERE id = ?`;
    await db.query(deleteQuery, [id]);

    // Log successful deletion
    await ActivityLogger.log(
      req.user,
      'DELETED',
      'PET',
      petInfo.name,
      `Deleted pet owned by ${petInfo.owner_name} (${petInfo.owner_email}) | Species: ${petInfo.type} | Breed: ${petInfo.breed || 'Mixed/Unknown'}`,
      req
    );

    res.status(200).json({
      success: true,
      message: `Pet "${petInfo.name}" owned by "${petInfo.owner_name}" has been deleted successfully`,
      deleted_by_staff: req.user.id
    });

  } catch (err) {
    console.error('Staff delete pet error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'DELETE_FAILED',
      'PET',
      `Pet ID: ${req.params.id}`,
      `Error deleting pet: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Get All Pet Records for Staff Dashboard
exports.getAllPetRecords = async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Validate sort parameters
    const validSortFields = ['created_at', 'name', 'type', 'breed', 'updated_at'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

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
        p.updated_at,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact,
        u.profile_photo_url as owner_photo_url,
        -- Get last groomed date from both appointments and walk-in bookings
        GREATEST(
          COALESCE(
            (SELECT MAX(COALESCE(actual_date, preferred_date)) 
             FROM appointments 
             WHERE pet_id = p.id AND status = 'completed'), 
            '1970-01-01'
          ),
          COALESCE(
            (SELECT MAX(DATE(created_at)) 
             FROM walk_in_bookings 
             WHERE pet_id = p.id AND status = 'completed'), 
            '1970-01-01'
          )
        ) as last_groomed_date
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner'
      ORDER BY p.${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(query, [parseInt(limit), offset]);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM pets p 
      INNER JOIN users u ON p.user_id = u.id 
      WHERE u.role = 'pet_owner'
    `;
    const [countResult] = await db.query(countQuery);
    const totalRecords = countResult[0].total;

    // Log the view activity
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'PET_RECORDS',
      'All Pet Records Dashboard',
      `Viewed page ${page} of pet records | Sort: ${sortField} ${order} | Total records: ${totalRecords}`,
      req
    );

    // Format the response with better structure
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
      updated_at: record.updated_at,
      last_groomed: record.last_groomed_date && record.last_groomed_date !== '1970-01-01' 
        ? record.last_groomed_date 
        : null,
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
      message: 'Pet records retrieved successfully by staff',
      pets: petRecords,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalRecords / parseInt(limit)),
        total_records: totalRecords,
        per_page: parseInt(limit),
        has_next: (parseInt(page) * parseInt(limit)) < totalRecords,
        has_prev: parseInt(page) > 1
      }
    });

  } catch (err) {
    console.error('Staff get all pet records error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'PET_RECORDS',
      'All Pet Records Dashboard',
      `Error retrieving pet records: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Get Pet Record by ID with detailed information
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
        p.updated_at,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact,
        u.profile_photo_url as owner_photo_url,
        u.created_at as owner_registered_date,
        -- Get last groomed date from both appointments and walk-in bookings
        GREATEST(
          COALESCE(
            (SELECT MAX(COALESCE(actual_date, preferred_date)) 
             FROM appointments 
             WHERE pet_id = p.id AND status = 'completed'), 
            '1970-01-01'
          ),
          COALESCE(
            (SELECT MAX(DATE(created_at)) 
             FROM walk_in_bookings 
             WHERE pet_id = p.id AND status = 'completed'), 
            '1970-01-01'
          )
        ) as last_groomed_date
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND u.role = 'pet_owner'
    `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      // Log failed attempt
      await ActivityLogger.log(
        req.user,
        'VIEW_FAILED',
        'PET',
        `Pet ID: ${id}`,
        'Failed to view pet record - Pet not found',
        req
      );

      return res.status(404).json({
        success: false,
        message: 'Pet record not found'
      });
    }

    const record = rows[0];

    // Get pet's appointment history
    let appointmentHistory = [];
    try {
      const appointmentQuery = `
        SELECT 
          id,
          preferred_date,
          preferred_time,
          actual_date,
          actual_time,
          status,
          total_amount,
          special_notes,
          created_at
        FROM appointments 
        WHERE pet_id = ?
        ORDER BY COALESCE(actual_date, preferred_date) DESC, COALESCE(actual_time, preferred_time) DESC
        LIMIT 10
      `;
      
      const [appointments] = await db.query(appointmentQuery, [id]);
      appointmentHistory = appointments;
    } catch (appointmentError) {
      console.log('Error fetching appointments:', appointmentError.message);
    }

    // Get walk-in booking history
    let walkInHistory = [];
    try {
      const walkInQuery = `
        SELECT 
          id,
          total_amount,
          status,
          special_notes,
          created_at,
          DATE(created_at) as service_date
        FROM walk_in_bookings 
        WHERE pet_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `;
      
      const [walkIns] = await db.query(walkInQuery, [id]);
      walkInHistory = walkIns;
    } catch (walkInError) {
      console.log('Error fetching walk-in bookings:', walkInError.message);
    }

    // Log successful view
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'PET',
      record.pet_name,
      `Viewed detailed pet record owned by ${record.owner_name} | Appointments: ${appointmentHistory.length} | Walk-ins: ${walkInHistory.length}`,
      req
    );

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
      updated_at: record.updated_at,
      last_groomed: record.last_groomed_date && record.last_groomed_date !== '1970-01-01' 
        ? record.last_groomed_date 
        : null,
      owner: {
        id: record.owner_id,
        name: record.owner_name,
        email: record.owner_email,
        contact_number: record.owner_contact,
        profile_photo_url: record.owner_photo_url,
        registered_date: record.owner_registered_date
      },
      appointment_history: appointmentHistory,
      walk_in_history: walkInHistory
    };

    res.status(200).json({
      success: true,
      message: 'Pet record retrieved successfully by staff',
      pet: petRecord
    });

  } catch (err) {
    console.error('Staff get pet record by ID error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'PET',
      `Pet ID: ${req.params.id}`,
      `Error retrieving pet record: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Get Pet Records Statistics for Staff Dashboard
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
        COUNT(CASE WHEN DATE(p.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as new_this_month,
        AVG(p.weight) as average_weight,
        MAX(p.created_at) as latest_registration,
        MIN(p.created_at) as earliest_registration
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

    // Get breed distribution (top 10)
    const breedStatsQuery = `
      SELECT 
        COALESCE(p.breed, 'Mixed/Unknown') as breed,
        COUNT(*) as count
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner'
      GROUP BY p.breed
      ORDER BY count DESC
      LIMIT 10
    `;

    const [breedStats] = await db.query(breedStatsQuery);

    // Get monthly registration trends (last 12 months)
    const trendsQuery = `
      SELECT 
        DATE_FORMAT(p.created_at, '%Y-%m') as month,
        COUNT(*) as registrations
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.role = 'pet_owner' 
      AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(p.created_at, '%Y-%m')
      ORDER BY month ASC
    `;

    const [trends] = await db.query(trendsQuery);

    // Log stats view activity
    await ActivityLogger.log(
      req.user,
      'VIEWED',
      'PET_STATISTICS',
      'Pet Records Statistics Dashboard',
      `Viewed statistics | Total pets: ${stats[0].total_pets} | Total owners: ${stats[0].total_pet_owners}`,
      req
    );

    res.status(200).json({
      success: true,
      message: 'Pet records statistics retrieved successfully by staff',
      stats: {
        ...stats[0],
        average_weight: stats[0].average_weight ? parseFloat(stats[0].average_weight).toFixed(2) : null,
        size_distribution: sizeStats,
        breed_distribution: breedStats,
        monthly_trends: trends
      }
    });

  } catch (err) {
    console.error('Staff get pet records stats error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'VIEW_FAILED',
      'PET_STATISTICS',
      'Pet Records Statistics Dashboard',
      `Error retrieving statistics: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Search Pet Records
exports.searchPetRecords = async (req, res) => {
  try {
    const { 
      query: searchQuery, 
      type, 
      size, 
      gender, 
      page = 1, 
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

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

    // Validate sort parameters
    const validSortFields = ['created_at', 'name', 'type', 'breed', 'updated_at'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

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
        p.updated_at,
        u.id as owner_id,
        u.name as owner_name,
        u.email as owner_email,
        u.contact_number as owner_contact,
        u.profile_photo_url as owner_photo_url
      FROM pets p
      INNER JOIN users u ON p.user_id = u.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.${sortField} ${order}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const [rows] = await db.query(query, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM pets p 
      INNER JOIN users u ON p.user_id = u.id 
      WHERE ${whereConditions.join(' AND ')}
    `;
    
    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const [countResult] = await db.query(countQuery, countParams);
    const totalRecords = countResult[0].total;

    // Build search criteria description for logging
    let searchCriteria = [];
    if (searchQuery) searchCriteria.push(`Query: "${searchQuery}"`);
    if (type) searchCriteria.push(`Type: ${type}`);
    if (size) searchCriteria.push(`Size: ${size}`);
    if (gender) searchCriteria.push(`Gender: ${gender}`);
    
    const criteriaDescription = searchCriteria.length > 0 ? searchCriteria.join(', ') : 'No filters';

    // Log search activity
    await ActivityLogger.log(
      req.user,
      'SEARCHED',
      'PET_RECORDS',
      'Pet Records Search',
      `Search completed | Criteria: ${criteriaDescription} | Results: ${totalRecords} | Page: ${page} | Sort: ${sortField} ${order}`,
      req
    );

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
      updated_at: record.updated_at,
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
      message: 'Pet records search completed by staff',
      pets: petRecords,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalRecords / parseInt(limit)),
        total_records: totalRecords,
        per_page: parseInt(limit),
        has_next: (parseInt(page) * parseInt(limit)) < totalRecords,
        has_prev: parseInt(page) > 1
      },
      search_criteria: { 
        query: searchQuery, 
        type, 
        size, 
        gender,
        sortBy: sortField,
        sortOrder: order
      }
    });

  } catch (err) {
    console.error('Staff search pet records error:', err);

    // Log the error
    await ActivityLogger.log(
      req.user,
      'SEARCH_FAILED',
      'PET_RECORDS',
      'Pet Records Search',
      `Search failed | Query: "${req.query.query || 'N/A'}" | Error: ${err.message}`,
      req
    );

    res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};