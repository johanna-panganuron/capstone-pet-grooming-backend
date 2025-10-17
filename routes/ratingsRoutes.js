// routes\ratingsRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');

/**
 * GET /api/ratings/public
 * Fetch public ratings from both appointments and walk-in bookings
 * Query params: page, limit, rating_filter
 */
router.get('/public', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const ratingFilter = parseInt(req.query.rating_filter) || null;
    const offset = (page - 1) * limit;

    console.log(`🔄 Fetching public ratings - Page: ${page}, Limit: ${limit}`);

    // Build WHERE clause for filtering
    let whereClause = '';
    let havingClause = '';
    const params = [];

    if (ratingFilter && ratingFilter >= 1 && ratingFilter <= 5) {
      havingClause = 'HAVING rating = ?';
      params.push(ratingFilter);
    }

    // Combined query to get ratings from both tables
    const ratingsQuery = `
(
  -- Appointment ratings
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
    p.name as pet_name,
    p.breed as pet_breed,  -- ADD THIS LINE
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
  -- Walk-in ratings
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
    p.name as pet_name,
    p.breed as pet_breed,  -- ADD THIS LINE
    p.photo_url as pet_photo,
    DATE(wb.created_at) as service_date,
    'walk_in' as booking_type
  FROM walk_in_ratings wr
  LEFT JOIN users u ON wr.customer_id = u.id
  LEFT JOIN walk_in_bookings wb ON wr.walk_in_booking_id = wb.id
  LEFT JOIN grooming_services gs ON wb.service_id = gs.id
  LEFT JOIN pets p ON wb.pet_id = p.id
)
${havingClause}
ORDER BY created_at DESC
LIMIT ? OFFSET ?
`;

    // Add limit and offset to params
    params.push(limit + 1, offset); // +1 to check if there are more records

    const [ratingsRows] = await db.execute(ratingsQuery, params);

    // Check if there are more records
    const hasMore = ratingsRows.length > limit;
    const reviews = hasMore ? ratingsRows.slice(0, -1) : ratingsRows;

    // Get services for each review
    const reviewsWithServices = await Promise.all(reviews.map(async (review) => {
      let services = [];

      try {
        if (review.booking_type === 'appointment' && review.booking_id) {
          // Get appointment services
          const [appointmentServices] = await db.execute(`
            SELECT DISTINCT gs.id, gs.name, aps.price
            FROM appointment_services aps
            JOIN grooming_services gs ON aps.service_id = gs.id
            WHERE aps.appointment_id = ?
            ORDER BY gs.name
          `, [review.booking_id]);

          services = appointmentServices.map(service => ({
            id: service.id,
            name: service.name,
            price: service.price
          }));
        } else if (review.booking_type === 'walk_in' && review.walk_in_booking_id) {
          // Get walk-in services
          const [walkInServices] = await db.execute(`
            SELECT DISTINCT gs.id, gs.name, wbs.price
            FROM walk_in_booking_services wbs
            JOIN grooming_services gs ON wbs.service_id = gs.id
            WHERE wbs.walk_in_booking_id = ?
            ORDER BY gs.name
          `, [review.walk_in_booking_id]);

          services = walkInServices.map(service => ({
            id: service.id,
            name: service.name,
            price: service.price
          }));
        }
      } catch (serviceError) {
        console.error(`Error fetching services for review ${review.id}:`, serviceError);
        services = [];
      }

      return {
        ...review,
        services: services
      };
    }));

    // Format reviews data
    const formattedReviews = reviewsWithServices.map(review => ({
      id: review.id,
      booking_id: review.booking_id,
      walk_in_booking_id: review.walk_in_booking_id,
      customer_id: review.customer_id,
      customer_name: review.customer_name,
      customer_photo: review.customer_photo ?
        (review.customer_photo.startsWith('http') ?
          review.customer_photo :
          `http://localhost:3000${review.customer_photo}`) : null,
      rating: review.rating,
      review: review.review,
      staff_friendliness: review.staff_friendliness || 0,
      service_quality: review.service_quality || 0,
      cleanliness: review.cleanliness || 0,
      value_for_money: review.value_for_money || 0,
      service_name: review.service_name,
      services: review.services || [],
      pet_name: review.pet_name,
      pet_breed: review.pet_breed,
      pet_photo: review.pet_photo ?
        (review.pet_photo.startsWith('http') ?
          review.pet_photo :
          `http://localhost:3000${review.pet_photo}`) : null,
      service_date: review.service_date,
      booking_type: review.booking_type,
      created_at: review.created_at
    }));


    // Get overall rating summary 
    const summaryQuery = `
      SELECT 
        AVG(combined_rating) as average_rating,
        COUNT(*) as total_ratings
      FROM (
        SELECT rating as combined_rating FROM ratings WHERE status = 'active'
        UNION ALL
        SELECT rating as combined_rating FROM walk_in_ratings
      ) combined_ratings
    `;

    const [summaryRows] = await db.execute(summaryQuery);
    const summary = summaryRows[0] || { average_rating: 0, total_ratings: 0 };

    // Get rating distribution 
    const distributionQuery = `
      SELECT 
        combined_rating as rating,
        COUNT(*) as count
      FROM (
        SELECT rating as combined_rating FROM ratings WHERE status = 'active'
        UNION ALL
        SELECT rating as combined_rating FROM walk_in_ratings
      ) combined_ratings
      GROUP BY combined_rating
      ORDER BY combined_rating DESC
    `;

    const [distributionRows] = await db.execute(distributionQuery);

    // Initialize distribution with zeros
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    // Fill in actual counts
    distributionRows.forEach(row => {
      if (row.rating >= 1 && row.rating <= 5) {
        distribution[row.rating] = parseInt(row.count);
      }
    });

    console.log(`Fetched ${formattedReviews.length} ratings with services for page ${page}`);

    res.json({
      success: true,
      data: {
        reviews: formattedReviews,
        summary: {
          average_rating: parseFloat(summary.average_rating) || 0,
          total_ratings: parseInt(summary.total_ratings) || 0
        },
        distribution,
        pagination: {
          current_page: page,
          per_page: limit,
          has_more: hasMore,
          total_on_page: formattedReviews.length
        }
      },
      message: `Retrieved ${formattedReviews.length} reviews`
    });

  } catch (error) {
    console.error('Error fetching public ratings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ratings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/ratings/summary
 * Get overall rating statistics
 */
router.get('/summary', async (req, res) => {
  try {
    console.log('Fetching rating summary...');

    // Get comprehensive summary including both appointment and walk-in ratings
    const summaryQuery = `
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
        FROM ratings 
        WHERE status = 'active'
        UNION ALL
        SELECT 
          rating as combined_rating,
          staff_friendliness as staff_avg,
          service_quality as service_avg,
          cleanliness as cleanliness_avg,
          value_for_money as value_avg
        FROM walk_in_ratings
      ) combined_ratings
    `;

    const [summaryRows] = await db.execute(summaryQuery);
    const summary = summaryRows[0] || {};

    // Get rating distribution
    const distributionQuery = `
      SELECT 
        combined_rating as rating,
        COUNT(*) as count
      FROM (
        SELECT rating as combined_rating FROM ratings WHERE status = 'active'
        UNION ALL
        SELECT rating as combined_rating FROM walk_in_ratings
      ) combined_ratings
      GROUP BY combined_rating
      ORDER BY combined_rating DESC
    `;

    const [distributionRows] = await db.execute(distributionQuery);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distributionRows.forEach(row => {
      if (row.rating >= 1 && row.rating <= 5) {
        distribution[row.rating] = parseInt(row.count);
      }
    });

    // Get recent reviews count (last 30 days)
    const recentCountQuery = `
      SELECT COUNT(*) as recent_count
      FROM (
        SELECT created_at FROM ratings WHERE status = 'active' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        UNION ALL
        SELECT created_at FROM walk_in_ratings WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ) recent_ratings
    `;

    const [recentCountRows] = await db.execute(recentCountQuery);
    const recentCount = recentCountRows[0]?.recent_count || 0;

    console.log('Rating summary fetched successfully');

    res.json({
      success: true,
      data: {
        average_rating: parseFloat(summary.average_rating) || 0,
        total_ratings: parseInt(summary.total_ratings) || 0,
        avg_staff_rating: parseFloat(summary.avg_staff_rating) || 0,
        avg_service_rating: parseFloat(summary.avg_service_rating) || 0,
        avg_cleanliness_rating: parseFloat(summary.avg_cleanliness_rating) || 0,
        avg_value_rating: parseFloat(summary.avg_value_rating) || 0,
        distribution,
        recent_count: parseInt(recentCount)
      }
    });

  } catch (error) {
    console.error('Error fetching rating summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating summary',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/ratings/recent
 * Get recent ratings for display
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    console.log(`Fetching ${limit} recent ratings...`);

    const query = `
    (
      SELECT 
        r.id,
        r.rating,
        r.review,
        r.created_at,
        u.name as customer_name,
        u.profile_photo_url as customer_photo,
        gs.name as service_name,
        p.name as pet_name,
        p.breed as pet_breed,  -- ADD THIS LINE
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
        wr.rating,
        wr.review,
        wr.created_at,
        u.name as customer_name,
        u.profile_photo_url as customer_photo,
        gs.name as service_name,
        p.name as pet_name,
        p.breed as pet_breed,  -- ADD THIS LINE
        'walk_in' as booking_type
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

    const recentRatings = rows.map(rating => ({
      id: rating.id,
      rating: rating.rating,
      review: rating.review ? rating.review.substring(0, 100) + '...' : null,
      customer_name: rating.customer_name,
      customer_photo: rating.customer_photo,
      service_name: rating.service_name,
      pet_name: rating.pet_name,
      booking_type: rating.booking_type,
      created_at: rating.created_at
    }));

    console.log(`Fetched ${recentRatings.length} recent ratings`);

    res.json({
      success: true,
      data: recentRatings,
      message: `Retrieved ${recentRatings.length} recent ratings`
    });

  } catch (error) {
    console.error('Error fetching recent ratings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent ratings',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;