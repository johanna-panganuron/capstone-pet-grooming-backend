// controllers\petController.js

const db = require('../models/db');

exports.addPet = async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get form data
    const { name, breed, birthDate, weight, type, gender } = req.body;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Validate required fields
    if (!name || !type || !gender) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Calculate size
    let calculatedSize = '';
    if (weight) {
      const weightNum = parseFloat(weight);
      if (weightNum <= 3) calculatedSize = 'XS';
      else if (weightNum <= 5) calculatedSize = 'SMALL';
      else if (weightNum <= 10) calculatedSize = 'MEDIUM';
      else if (weightNum <= 20) calculatedSize = 'LARGE';
      else if (weightNum <= 30) calculatedSize = 'XL';
      else calculatedSize = 'XXL';
    }

    // Calculate age
    let calculatedAge = '';
    if (birthDate) {
      const today = new Date();
      const birth = new Date(birthDate);
      let years = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        years--;
      }
      
      calculatedAge = years > 0 ? `${years} years old` : 'Less than 1 year';
    }

    const query = `
    INSERT INTO pets (user_id, name, breed, birth_date, weight, type, gender, size, photo_url, age)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await db.execute(query, [
    req.user.id,
    name, 
    breed || null, 
    birthDate || null,
    weight || null, 
    type, 
    gender, 
    calculatedSize || null, 
    photoUrl,
    calculatedAge || null
  ]);

  // Get the newly created pet
  const [pet] = await db.execute(
    'SELECT * FROM pets WHERE id = ?', 
    [result.insertId]
  );

  res.status(201).json(pet[0]);
} catch (error) {
  console.error('Error adding pet:', error);
  res.status(500).json({ message: 'Error adding pet', error: error.message });
}
};

exports.getAllPets = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [pets] = await db.execute(
      'SELECT * FROM pets WHERE user_id = ?', 
      [req.user.id]
    );
    res.json(pets);
  } catch (error) {
    console.error('Error fetching pets:', error);
    res.status(500).json({ message: 'Error fetching pets' });
  }
};

exports.getPetById = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const [rows] = await db.execute(
      'SELECT * FROM pets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pet not found or not owned by user' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching pet:', error);
    res.status(500).json({ message: 'Error fetching pet' });
  }
};

exports.updatePet = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, breed, birthDate, weight, type, gender, size } = req.body;
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // First verify pet belongs to user and get current data
    const [verify] = await db.execute(
      'SELECT * FROM pets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    
    if (verify.length === 0) {
      return res.status(404).json({ message: 'Pet not found or not owned by user' });
    }

    // Calculate size if not provided but weight is
    let calculatedSize = size;
    if (weight && !size) {
      const weightNum = parseFloat(weight);
      if (weightNum <= 3) calculatedSize = 'XS';
      else if (weightNum <= 5) calculatedSize = 'SMALL';
      else if (weightNum <= 10) calculatedSize = 'MEDIUM';
      else if (weightNum <= 20) calculatedSize = 'LARGE';
      else if (weightNum <= 30) calculatedSize = 'XL';
      else calculatedSize = 'XXL';
    }

    // Calculate age if not provided but birthDate is
    let calculatedAge = '';
    if (birthDate) {
      const today = new Date();
      const birth = new Date(birthDate);
      let years = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        years--;
      }
      
      calculatedAge = years > 0 ? `${years} years old` : 'Less than 1 year';
    }

    let query = `
      UPDATE pets SET name = ?, breed = ?, birth_date = ?, weight = ?, 
      type = ?, gender = ?, size = ?, age = ?
    `;
    const values = [
      name, 
      breed || null, 
      birthDate || null, 
      weight || null, 
      type, 
      gender, 
      calculatedSize || null,
      calculatedAge || null
    ];

    if (photoUrl) {
      query += `, photo_url = ?`;
      values.push(photoUrl);
    }

    query += ` WHERE id = ? AND user_id = ?`;
    values.push(req.params.id, req.user.id);

    const [result] = await db.execute(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Pet not found or not owned by user' });
    }

    // Get the fully updated pet record to return
    const [updatedPet] = await db.execute(
      'SELECT * FROM pets WHERE id = ?',
      [req.params.id]
    );

    res.status(200).json({
      message: 'Pet updated successfully',
      pet: updatedPet[0] // Return the complete updated pet object
    });
  } catch (error) {
    console.error('Error updating pet:', error);
    res.status(500).json({ 
      message: 'Error updating pet',
      error: error.message 
    });
  }
};

exports.deletePet = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // First verify pet belongs to user
    const [verify] = await db.execute(
      'SELECT id FROM pets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    
    if (verify.length === 0) {
      return res.status(404).json({ message: 'Pet not found or not owned by user' });
    }

    const [result] = await db.execute(
      'DELETE FROM pets WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Pet not found or not owned by user' });
    }
    
    res.json({ message: 'Pet deleted successfully' });
  } catch (error) {
    console.error('Error deleting pet:', error);
    res.status(500).json({ message: 'Error deleting pet' });
  }
};

exports.getGroomingStats = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const petId = req.params.id;

    // Verify pet belongs to user
    const [petCheck] = await db.execute(
      'SELECT id FROM pets WHERE id = ? AND user_id = ?',
      [petId, req.user.id]
    );

    if (petCheck.length === 0) {
      return res.status(404).json({ message: 'Pet not found or not owned by user' });
    }

    // Get total sessions count (both appointments and walk-ins)
    const [totalSessionsResult] = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE pet_id = ?) +
        (SELECT COUNT(*) FROM walk_in_bookings WHERE pet_id = ?) as total_sessions
    `, [petId, petId]);

    // Get completed sessions count
    const [completedSessionsResult] = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM appointments WHERE pet_id = ? AND status = 'completed') +
        (SELECT COUNT(*) FROM walk_in_bookings WHERE pet_id = ? AND status = 'completed') as completed_sessions
    `, [petId, petId]);

    // Get total amount spent
    const [totalSpentResult] = await db.execute(`
      SELECT 
        COALESCE(
          (SELECT SUM(total_amount) FROM appointments WHERE pet_id = ? AND status = 'completed'), 0
        ) +
        COALESCE(
          (SELECT SUM(total_amount) FROM walk_in_bookings WHERE pet_id = ? AND status = 'completed'), 0
        ) as total_spent
    `, [petId, petId]);

    // Get last groomed date (most recent completed session)
    const [lastGroomedResult] = await db.execute(`
      SELECT MAX(service_date) as last_groomed_date
      FROM (
        SELECT actual_date as service_date FROM appointments 
        WHERE pet_id = ? AND status = 'completed' AND actual_date IS NOT NULL
        UNION ALL
        SELECT DATE(updated_at) as service_date FROM walk_in_bookings 
        WHERE pet_id = ? AND status = 'completed'
      ) combined_dates
    `, [petId, petId]);

    // Format last groomed date
    let lastGroomed = 'Never';
    if (lastGroomedResult[0]?.last_groomed_date) {
      const date = new Date(lastGroomedResult[0].last_groomed_date);
      lastGroomed = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }

    // Get favorite services (most frequently used services)
    const [favoriteServicesResult] = await db.execute(`
      SELECT 
        gs.id,
        gs.name,
        gs.category,
        gs.image_url,
        service_counts.session_count
      FROM (
        SELECT service_id, COUNT(*) as session_count
        FROM (
          SELECT service_id FROM appointments WHERE pet_id = ? AND status = 'completed'
          UNION ALL
          SELECT service_id FROM walk_in_bookings WHERE pet_id = ? AND status = 'completed'
        ) combined_services
        GROUP BY service_id
        ORDER BY session_count DESC
        LIMIT 3
      ) service_counts
      JOIN grooming_services gs ON gs.id = service_counts.service_id
    `, [petId, petId]);

    const stats = {
      total_sessions: totalSessionsResult[0]?.total_sessions || 0,
      completed_sessions: completedSessionsResult[0]?.completed_sessions || 0,
      total_spent: totalSpentResult[0]?.total_spent || 0,
      last_groomed: lastGroomed,
      favorite_services: favoriteServicesResult || []
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching grooming stats:', error);
    res.status(500).json({ message: 'Error fetching grooming stats' });
  }
};

