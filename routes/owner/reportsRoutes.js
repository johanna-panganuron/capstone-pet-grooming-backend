// routes/owner/reportsRoutes.js
const express = require('express');
const router = express.Router();
const reportsController = require('../../controllers/owner/reportsController');
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');

/**
GET /api/owner/reports
Get comprehensive reports based on filters
{string} dateRange - Date range filter (today, week, month, quarter, year, custom)
{string} reportType - Type of report (overview, revenue, services, customers, staff)
{string} startDate - Start date for custom range (YYYY-MM-DD)
{string} endDate - End date for custom range (YYYY-MM-DD)
 */
router.get('/', verifyToken, verifyOwner, reportsController.getReports);

/**
GET /api/owner/reports/export
Export reports to Excel format
{string} dateRange - Date range filter
{string} reportType - Type of report to export
{string} startDate - Start date for custom range
{string} endDate - End date for custom range
 */
router.get('/export', verifyToken, verifyOwner, reportsController.exportReports);

module.exports = router;