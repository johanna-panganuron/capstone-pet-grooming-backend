// routes/owner/transactionHistoryRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, verifyOwner } = require('../../middleware/authMiddleware');
const {
    getTransactionHistory,
    getTransactionStatistics,
    getDailyRevenue,
    getTransactionById,
    updateTransactionStatus,
    getTopServices,
    exportTransactionReport
} = require('../../controllers/owner/transactionHistoryController');

// Apply authentication middleware to all routes
router.use(verifyToken, verifyOwner);

// Get all transactions with filters
router.get('/', getTransactionHistory);

// Get transaction statistics
router.get('/statistics', getTransactionStatistics);

// Get daily revenue report
router.get('/daily-revenue', getDailyRevenue);

// Get top services by revenue
router.get('/top-services', getTopServices);

// Export transaction report as CSV
router.get('/export', exportTransactionReport);

// Get specific transaction by ID
router.get('/:id', getTransactionById);

// Update transaction status
router.patch('/:id/status', updateTransactionStatus);

module.exports = router;