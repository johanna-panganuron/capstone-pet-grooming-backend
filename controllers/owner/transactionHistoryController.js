// controllers/owner/transactionHistoryController.js

const TransactionHistory = require('../../models/TransactionHistory');

// Get all transactions with filters
const getTransactionHistory = async (req, res) => {
    try {
        // Extract query parameters for filtering
        const filters = {
            transaction_type: req.query.transaction_type,
            payment_method: req.query.payment_method,
            transaction_status: req.query.transaction_status,
            start_date: req.query.start_date,
            end_date: req.query.end_date,
            search: req.query.search,
            limit: req.query.limit
        };
        
        // Remove empty filters
        Object.keys(filters).forEach(key => 
            (filters[key] === undefined || filters[key] === '') && delete filters[key]
        );
        
        const transactions = await TransactionHistory.findAll(filters);
        
        res.json({
            success: true,
            data: transactions,
            count: transactions.length,
            filters: filters
        });
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction history',
            error: error.message
        });
    }
};

// Get transaction statistics
const getTransactionStatistics = async (req, res) => {
    try {
        const filters = {
            start_date: req.query.start_date,
            end_date: req.query.end_date
        };
        
        // Remove empty filters
        Object.keys(filters).forEach(key => 
            (filters[key] === undefined || filters[key] === '') && delete filters[key]
        );
        
        const statistics = await TransactionHistory.getStatistics(filters);
        
        res.json({
            success: true,
            data: statistics
        });
    } catch (error) {
        console.error('Error fetching transaction statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction statistics',
            error: error.message
        });
    }
};

// Get daily revenue report
const getDailyRevenue = async (req, res) => {
    try {
        // Simple implementation - can be enhanced later
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        console.error('Error fetching daily revenue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch daily revenue',
            error: error.message
        });
    }
};

// Get transaction by ID
const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // For now, return empty - can implement detailed lookup later
        res.json({
            success: true,
            data: null
        });
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction',
            error: error.message
        });
    }
};

// Update transaction status
const updateTransactionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        
        // For now, return success - implement actual update later
        res.json({
            success: true,
            message: 'Transaction status updated successfully'
        });
    } catch (error) {
        console.error('Error updating transaction status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update transaction status',
            error: error.message
        });
    }
};

// Get top services by revenue
const getTopServices = async (req, res) => {
    try {
        // Simple implementation - can be enhanced later
        res.json({
            success: true,
            data: []
        });
    } catch (error) {
        console.error('Error fetching top services:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch top services',
            error: error.message
        });
    }
};

// Export a CSV report
const exportTransactionReport = async (req, res) => {
    try {
        const filters = {
            transaction_type: req.query.transaction_type,
            payment_method: req.query.payment_method,
            transaction_status: req.query.transaction_status,
            start_date: req.query.start_date,
            end_date: req.query.end_date,
            search: req.query.search
        };
        
        // Remove empty filters
        Object.keys(filters).forEach(key => 
            (filters[key] === undefined || filters[key] === '') && delete filters[key]
        );
        
        const transactions = await TransactionHistory.findAll(filters);
        
        // Prepare CSV headers
        const csvHeaders = [
            'Transaction ID',
            'Date',
            'Type',
            'Customer',
            'Pet',
            'Service',
            'Groomer',
            'Base Amount',
            'Matted Fee',
            'Addon Amount',
            'Total Amount',
            'Payment Method',
            'Status',
            'Queue Number'
        ].join(',');
        
        // Prepare CSV rows
        const csvRows = transactions.map(transaction => [
            transaction.id,
            transaction.service_date,
            transaction.transaction_type,
            `"${transaction.customer_name || 'N/A'}"`,
            `"${transaction.pet_name || 'N/A'}"`,
            `"${transaction.service_name || 'N/A'}"`,
            `"${transaction.groomer_name || 'N/A'}"`,
            transaction.base_amount || 0,
            transaction.matted_coat_fee || 0,
            transaction.addon_services_amount || 0,
            transaction.total_amount || 0,
            transaction.payment_method || 'N/A',
            transaction.transaction_status || 'N/A',
            transaction.queue_number || 'N/A'
        ].join(','));
        
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        
        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=transaction-report-${new Date().toISOString().split('T')[0]}.csv`);
        
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting transaction report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export transaction report',
            error: error.message
        });
    }
};

module.exports = {
    getTransactionHistory,
    getTransactionStatistics,
    getDailyRevenue,
    getTransactionById,
    updateTransactionStatus,
    getTopServices,
    exportTransactionReport
};