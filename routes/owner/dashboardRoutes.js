// routes/owner/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');
const dashboardController = require('../../controllers/owner/dashboardController');

// Apply middleware to all routes
router.use(verifyToken);
router.use(verifyOwner);

/**
GET /api/owner/dashboard
Get dashboard overview statistics
 */
router.get('/', dashboardController.getDashboardOverview);

/**
GET /api/owner/dashboard/revenue-chart
Get revenue chart data for specified period
days - Number of days (7, 30, 90)
 */
router.get('/revenue-chart', dashboardController.getRevenueChart);

/**
GET /api/owner/dashboard/monthly-stats
Get monthly statistics for specific month/year
year - Year (optional, defaults to current year)
month - Month (optional, defaults to current month)
 */
router.get('/monthly-stats', dashboardController.getMonthlyStats);

/**
GET /api/owner/dashboard/top-groomers
Get top performing groomers
limit - Number of groomers to return (default: 5)
days - Period in days (default: 30)
 */
router.get('/top-groomers', dashboardController.getTopGroomers);

/**
GET /api/owner/dashboard/insights
Get business insights and recommendations
 */
router.get('/insights', dashboardController.getBusinessInsights);

/**
GET /api/owner/dashboard/real-time
Get real-time dashboard updates
 */
router.get('/real-time', dashboardController.getRealTimeUpdates);

module.exports = router;