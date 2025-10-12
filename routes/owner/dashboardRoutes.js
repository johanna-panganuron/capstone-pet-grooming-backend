// routes/owner/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');
const dashboardController = require('../../controllers/owner/dashboardController');

// Apply middleware to all routes
router.use(verifyToken);
router.use(verifyOwner);

/**
 * @route   GET /api/owner/dashboard
 * @desc    Get dashboard overview statistics
 * @access  Owner only
 */
router.get('/', dashboardController.getDashboardOverview);

/**
 * @route   GET /api/owner/dashboard/revenue-chart
 * @desc    Get revenue chart data for specified period
 * @access  Owner only
 * @query   days - Number of days (7, 30, 90)
 */
router.get('/revenue-chart', dashboardController.getRevenueChart);

/**
 * @route   GET /api/owner/dashboard/monthly-stats
 * @desc    Get monthly statistics for specific month/year
 * @access  Owner only
 * @query   year - Year (optional, defaults to current year)
 * @query   month - Month (optional, defaults to current month)
 */
router.get('/monthly-stats', dashboardController.getMonthlyStats);

/**
 * @route   GET /api/owner/dashboard/top-groomers
 * @desc    Get top performing groomers
 * @access  Owner only
 * @query   limit - Number of groomers to return (default: 5)
 * @query   days - Period in days (default: 30)
 */
router.get('/top-groomers', dashboardController.getTopGroomers);

/**
 * @route   GET /api/owner/dashboard/insights
 * @desc    Get business insights and recommendations
 * @access  Owner only
 */
router.get('/insights', dashboardController.getBusinessInsights);

/**
 * @route   GET /api/owner/dashboard/real-time
 * @desc    Get real-time dashboard updates
 * @access  Owner only
 */
router.get('/real-time', dashboardController.getRealTimeUpdates);

module.exports = router;