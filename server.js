// server.js
const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { initSocket } = require('./socketServer'); 
    
// Load environment variables
dotenv.config();

// Database
const db = require('./models/db');
const GroomingService = require('./models/GroomingService');

// Create upload directories if missing
['uploads', 'uploads/profiles', 'uploads/gallery', 'uploads/pets', 'uploads/services'].forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const app = express();
const PORT = process.env.PORT || 3000;

console.log('✅ Environment loaded');

// Middleware
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use((req, res, next) => { req.db = db; next(); });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Public / Pet Owner routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/ratings', require('./routes/ratingsRoutes')); 
app.use('/api', require('./routes/dashboardRoutes'));
app.use('/api/pets', require('./routes/petRoutes'));
app.use('/api/faqs', require('./routes/faqRoutes'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/contact-info', require('./routes/contactInfoRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/walk-ins', require('./routes/walkInRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Staff routes
app.use('/api/staff/dashboard', require('./routes/staff/dashboardRoutes'));
app.use('/api/staff/notifications', require('./routes/staff/notificationsRoutes'));
app.use('/api/staff/grooming-services', require('./routes/staff/groomingServiceRoutes'));
app.use('/api/staff/pet-records', require('./routes/staff/petRecordsRoutes'));
app.use('/api/staff/customers', require('./routes/staff/customerRoutes'));
app.use('/api/staff/appointments', require('./routes/staff/appointmentRoutes'));
app.use('/api/staff/walk-in', require('./routes/staff/walkInRoutes'));
app.use('/api/staff', require('./routes/staff/profileRoutes'));

// Owner routes
app.use('/api/owner/dashboard', require('./routes/owner/dashboardRoutes'));
app.use('/api/owner/notifications', require('./routes/owner/notificationsRoutes'));
app.use('/api/owner/appointments', require('./routes/owner/appointmentRoutes'));
app.use('/api/owner/walk-in', require('./routes/owner/walkInRoutes'));
app.use('/api/owner/customers', require('./routes/owner/customerRoutes'));
app.use('/api/owner/pet-records', require('./routes/owner/petRecordsRoutes'));
app.use('/api/owner/services', require('./routes/owner/groomingServiceRoutes'));
app.use('/api/owner', require('./routes/owner/staffRoutes'));
app.use('/api/owner/gallery', require('./routes/owner/galleryRoutes'));
app.use('/api/owner/transaction-history', require('./routes/owner/transactionHistoryRoutes'));
app.use('/api/owner/reports', require('./routes/owner/reportsRoutes'));
app.use('/api/owner/activity-logs', require('./routes/owner/activityLogRoutes'));
app.use('/api/owner', require('./routes/owner/faqRoutes'));
app.use('/api/owner', require('./routes/owner/contactInfoRoutes'));

// Contact form
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
        });

        await transporter.sendMail({
            from: email,
            to: process.env.GMAIL_USER,
            subject: `Contact Form: ${subject || 'No Subject'}`,
            text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage: ${message}`
        });

        res.status(200).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// Public services
app.get('/api/services', async (req, res) => {
    try {
        const services = await GroomingService.findAll();
        const available = services.filter(s => s.status === 'available');
        res.json({ success: true, data: available, count: available.length });
    } catch (error) {
        console.error('Public services fetch error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch services' });
    }
});

// Auth check
app.get('/api/auth/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ user: null });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [user] = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
        if (user.length === 0) return res.status(401).json({ user: null });

        res.json({ user: user[0] });
    } catch {
        res.status(401).json({ user: null });
    }
});

// Logout
app.get('/api/auth/logout', (req, res) => res.json({ success: true, message: 'Logged out successfully' }));

// Update contact number
app.post('/api/users/:id/contact-number', async (req, res) => {
    try {
        await db.query('UPDATE users SET contact_number = ? WHERE id = ?', [req.body.contact_number, req.params.id]);
        res.json({ success: true, message: 'Contact number updated!' });
    } catch (error) {
        console.error('Error updating contact number:', error);
        res.status(500).json({ success: false, message: 'Failed to update contact number.' });
    }
});

// Test
app.get('/', (req, res) => res.send('Pet Grooming Backend API is running'));

// Error handling
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || typeof err === 'string') {
        return res.status(400).json({ success: false, message: err });
    }
    next(err);
});
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
});

// --- SOCKET.IO SERVER START ---
const server = http.createServer(app);
const io = initSocket(server);

// Make io accessible in routes
app.set('io', io);

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.io server initialized`);
});
