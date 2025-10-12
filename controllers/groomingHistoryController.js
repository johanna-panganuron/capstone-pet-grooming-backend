// controllers/groomingHistoryController.js

const db = require('../models/db');

exports.getPetGroomingHistory = async (req, res) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
  
      const petId = req.params.petId;
      
      // First verify that the pet belongs to the authenticated user
      const [petCheck] = await db.execute(
        'SELECT id FROM pets WHERE id = ? AND user_id = ?',
        [petId, req.user.id]
      );
      
      if (petCheck.length === 0) {
        return res.status(404).json({ message: 'Pet not found or not owned by user' });
      }
  
     // Updated query to include ALL statuses
     const query = `
     (
       -- Appointment-based grooming sessions with all services
       SELECT 
         a.id,
         'appointment' as service_type,
         GROUP_CONCAT(DISTINCT gs.name ORDER BY gs.name SEPARATOR ', ') as service_name,
         a.total_amount,
         a.special_notes,
         a.payment_method,
         a.status,
         a.before_image as before_photo,  
         a.after_image as after_photo,    
         COALESCE(a.actual_date, a.preferred_date) as service_date,
         COALESCE(a.actual_time, a.preferred_time) as service_time,
         u.name as groomer_name,
         r.rating,
         r.review,
         a.created_at,
         a.updated_at
       FROM appointments a
       LEFT JOIN appointment_services aps ON a.id = aps.appointment_id
       LEFT JOIN grooming_services gs ON (a.service_id = gs.id OR aps.service_id = gs.id)
       LEFT JOIN users u ON a.groomer_id = u.id
       LEFT JOIN ratings r ON a.id = r.appointment_id
       WHERE a.pet_id = ? 
       -- REMOVE this filter: AND a.status IN ('completed', 'in_progress', 'cancelled')
       GROUP BY a.id
     )
     
     UNION ALL
     
     (
       -- Walk-in grooming sessions with all services
       SELECT 
         wb.id,
         'walk_in' as service_type,
         GROUP_CONCAT(DISTINCT gs.name ORDER BY gs.name SEPARATOR ', ') as service_name,
         wb.total_amount,
         wb.special_notes,
         wb.payment_method,
         wb.status,
         wb.before_photo as before_photo,  
         wb.after_photo as after_photo,    
         DATE(wb.created_at) as service_date,
         wb.time_slot as service_time,
         u.name as groomer_name,
         wr.rating,
         wr.review,
         wb.created_at,
         wb.updated_at
       FROM walk_in_bookings wb
       LEFT JOIN walk_in_booking_services wbs ON wb.id = wbs.walk_in_booking_id
       LEFT JOIN grooming_services gs ON (wb.service_id = gs.id OR wbs.service_id = gs.id)
       LEFT JOIN users u ON wb.groomer_id = u.id
       LEFT JOIN walk_in_ratings wr ON wb.id = wr.walk_in_booking_id
       WHERE wb.pet_id = ? 
       -- REMOVE this filter: AND wb.status IN ('completed', 'in_progress', 'cancelled')
       GROUP BY wb.id
     )
     
     ORDER BY service_date DESC, created_at DESC
      `;
  
      const [history] = await db.execute(query, [petId, petId]);
  
      // Format the response data
      const formattedHistory = history.map(record => ({
        id: record.id,
        service_type: record.service_type,
        service_name: record.service_name || 'Grooming Service',
        total_amount: parseFloat(record.total_amount || 0),
        special_notes: record.special_notes,
        payment_method: record.payment_method,
        status: record.status,
        before_photo: record.before_photo,
        after_photo: record.after_photo,
        service_date: record.service_date,
        service_time: record.service_time,
        groomer_name: record.groomer_name,
        rating: record.rating,
        review: record.review,
        created_at: record.created_at,
        updated_at: record.updated_at
      }));
  
      res.json(formattedHistory);
  
    } catch (error) {
      console.error('Error fetching pet grooming history:', error);
      res.status(500).json({ 
        message: 'Error fetching grooming history',
        error: error.message 
      });
    }
  };
  exports.getGroomingHistoryStats = async (req, res) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
  
      const petId = req.params.petId;
      
      // First verify that the pet belongs to the authenticated user
      const [petCheck] = await db.execute(
        'SELECT id, name FROM pets WHERE id = ? AND user_id = ?',
        [petId, req.user.id]
      );
      
      if (petCheck.length === 0) {
        return res.status(404).json({ message: 'Pet not found or not owned by user' });
      }
  
      const statsQuery = `
            SELECT 
              COUNT(*) as total_sessions,
              AVG(total_amount) as avg_amount,
              SUM(total_amount) as total_spent,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
              COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_sessions,
              COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_sessions,
              COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_sessions,
              COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting_sessions,
              COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_sessions,
              COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_show_sessions,
              MAX(CASE WHEN status = 'completed' THEN service_date END) as last_completed_visit
              FROM (
              SELECT total_amount, status, 
                     COALESCE(actual_date, preferred_date) as service_date
              FROM appointments 
              WHERE pet_id = ? 
              
              UNION ALL
              
              SELECT total_amount, status, DATE(created_at) as service_date
              FROM walk_in_bookings 
              WHERE pet_id = ? 
            ) as combined_history
          `;
  
      const [stats] = await db.execute(statsQuery, [petId, petId]);
  
      // Get most frequent service (single service for backward compatibility) - including addon services
      const frequentServiceQuery = `
        SELECT service_name, COUNT(*) as frequency
        FROM (
          -- Main services from appointments
          SELECT gs.name as service_name
          FROM appointments a
          LEFT JOIN grooming_services gs ON a.service_id = gs.id
          WHERE a.pet_id = ? AND a.status = 'completed' AND gs.name IS NOT NULL
          
          UNION ALL
          
          -- Addon services from appointments  
          SELECT gs.name as service_name
          FROM appointments a
          JOIN appointment_services aps ON a.id = aps.appointment_id
          JOIN grooming_services gs ON aps.service_id = gs.id
          WHERE a.pet_id = ? AND a.status = 'completed'
          
          UNION ALL
          
          -- Main services from walk-ins
          SELECT gs.name as service_name
          FROM walk_in_bookings wb
          LEFT JOIN grooming_services gs ON wb.service_id = gs.id
          WHERE wb.pet_id = ? AND wb.status = 'completed' AND gs.name IS NOT NULL
          
          UNION ALL
          
          -- Addon services from walk-ins
          SELECT gs.name as service_name
          FROM walk_in_bookings wb
          JOIN walk_in_booking_services wbs ON wb.id = wbs.walk_in_booking_id
          JOIN grooming_services gs ON wbs.service_id = gs.id
          WHERE wb.pet_id = ? AND wb.status = 'completed'
        ) as services
        GROUP BY service_name
        ORDER BY frequency DESC
        LIMIT 1
      `;
  
      const [frequentService] = await db.execute(frequentServiceQuery, [petId, petId, petId, petId]);
  
      // Get favorite services (multiple services with details) - including addon services
      const favoriteServicesQuery = `
        SELECT 
          gs.id,
          gs.name,
          gs.category,
          gs.image_url,
          service_counts.session_count
        FROM (
          SELECT service_id, COUNT(*) as session_count
          FROM (
            -- Main services from appointments
            SELECT service_id FROM appointments WHERE pet_id = ? AND status = 'completed' AND service_id IS NOT NULL
            
            UNION ALL
            
            -- Addon services from appointments
            SELECT aps.service_id FROM appointments a
            JOIN appointment_services aps ON a.id = aps.appointment_id
            WHERE a.pet_id = ? AND a.status = 'completed' AND aps.service_id IS NOT NULL
            
            UNION ALL
            
            -- Main services from walk-ins
            SELECT service_id FROM walk_in_bookings WHERE pet_id = ? AND status = 'completed' AND service_id IS NOT NULL
            
            UNION ALL
            
            -- Addon services from walk-ins
            SELECT wbs.service_id FROM walk_in_bookings wb
            JOIN walk_in_booking_services wbs ON wb.id = wbs.walk_in_booking_id
            WHERE wb.pet_id = ? AND wb.status = 'completed' AND wbs.service_id IS NOT NULL
          ) combined_services
          GROUP BY service_id
          ORDER BY session_count DESC
          LIMIT 5
        ) service_counts
        JOIN grooming_services gs ON gs.id = service_counts.service_id
        ORDER BY service_counts.session_count DESC
      `;
  
      const [favoriteServices] = await db.execute(favoriteServicesQuery, [petId, petId, petId, petId]);
  
      console.log('Debug - Favorite services found:', favoriteServices); 
  
      const responseStats = {
        pet_name: petCheck[0].name,
        total_sessions: parseInt(stats[0].total_sessions || 0),
        completed_sessions: parseInt(stats[0].completed_sessions || 0),
        cancelled_sessions: parseInt(stats[0].cancelled_sessions || 0),
        avg_amount: parseFloat(stats[0].avg_amount || 0),
        total_spent: parseFloat(stats[0].total_spent || 0),
        last_visit: stats[0].last_completed_visit,
        most_frequent_service: frequentService[0]?.service_name || null,
        most_frequent_service_count: parseInt(frequentService[0]?.frequency || 0),
        favorite_services: favoriteServices || [] 
      };
  
      console.log('Debug - Final response stats:', responseStats); 
  
      res.json(responseStats);
  
    } catch (error) {
      console.error('Error fetching grooming history stats:', error);
      res.status(500).json({ 
        message: 'Error fetching grooming history statistics',
        error: error.message 
      });
    }
  };