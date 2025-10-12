// routes/owner/reportsRoutes.js
const express = require('express');
const router = express.Router();
const reportsController = require('../../controllers/owner/reportsController');
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');

/**
 * @route   GET /api/owner/reports
 * @desc    Get comprehensive reports based on filters
 * @access  Owner only
 * @query   {string} dateRange - Date range filter (today, week, month, quarter, year, custom)
 * @query   {string} reportType - Type of report (overview, revenue, services, customers, staff)
 * @query   {string} startDate - Start date for custom range (YYYY-MM-DD)
 * @query   {string} endDate - End date for custom range (YYYY-MM-DD)
 */
router.get('/', verifyToken, verifyOwner, reportsController.getReports);

/**
 * @route   GET /api/owner/reports/export
 * @desc    Export reports to Excel format
 * @access  Owner only
 * @query   {string} dateRange - Date range filter
 * @query   {string} reportType - Type of report to export
 * @query   {string} startDate - Start date for custom range
 * @query   {string} endDate - End date for custom range
 */
router.get('/export', verifyToken, verifyOwner, reportsController.exportReports);

module.exports = router;