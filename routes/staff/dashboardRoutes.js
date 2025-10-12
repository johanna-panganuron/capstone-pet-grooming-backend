// routes/staff/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, authorize } = require('../../middleware/authMiddleware');
const DashboardStaffController = require('../../controllers/staff/dashboardController');

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(authorize(['staff', 'owner'])); // Allow both staff and owner roles

// Dashboard routes
router.get('/stats', DashboardStaffController.getDashboardStats);
router.get('/today-schedule', DashboardStaffController.getTodaySchedule);
router.get('/recent-activities', DashboardStaffController.getRecentActivities);
router.get('/user-profile', DashboardStaffController.getUserProfile); // Add this line

module.exports = router;