// routes/owner/activityLogRoutes.js
const express = require('express');
const router = express.Router();
const activityLogController = require('../../controllers/owner/activityLogController');
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(verifyOwner);

// GET /api/owner/activity-logs - Get all activity logs with filtering and pagination
router.get('/', activityLogController.getAllActivities);

// GET /api/owner/activity-logs/stats - Get activity statistics
router.get('/stats', activityLogController.getStats);

// GET /api/owner/activity-logs/filter-options - Get filter options for dropdowns
router.get('/filter-options', activityLogController.getFilterOptions);

module.exports = router;