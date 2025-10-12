// routes\dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const DashboardController = require('../controllers/dashboardController');

router.get('/dashboardpetowner', verifyToken, (req, res) => {
  if (req.user.role !== 'pet_owner') {
    return res.status(403).json({ message: 'Forbidden: Not a pet owner' });
  }

  res.json({
    message: `Welcome to Mimi's Pet Grooming, ${req.user.name}!`,
    user: req.user
  });
});

// Dashboard routes
router.get('/dashboard', verifyToken, DashboardController.getDashboardData);
router.get('/dashboard/overview', verifyToken, DashboardController.getUserOverview);

module.exports = router;