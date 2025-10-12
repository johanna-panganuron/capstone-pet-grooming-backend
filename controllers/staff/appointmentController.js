// controllers/staff/appointmentController.js
const Appointment = require('../../models/Appointment');
const GroomingService = require('../../models/GroomingService');
const User = require('../../models/User');
const db = require('../../models/db');
const Payment = require('../../models/Payment');
const { sendNotificationToUser } = require('../../socketServer');
const { ActivityLogger } = require('../../utils/activityLogger');
const Notification = require('../../models/Notification');
const PDFDocument = require('pdfkit');
const path = require('path');

// Add these helper functions at the top of your appointmentController.js
function formatDateForLog(date) {
    if (!date) return 'N/A';
    try {
        const d = new Date(date);
        return d.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return date.toString();
    }
}

function formatTimeForLog(time) {
    if (!time) return 'N/A';
    
    if (time.includes('AM') || time.includes('PM')) {
        return time;
    }
    
    try {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours, 10);
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes || '00'} ${period}`;
    } catch (e) {
        return time.toString();
    }
}
// Generate and download receipt PDF with walk-in style design
exports.generateReceipt = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("=== STAFF GENERATE APPOINTMENT RECEIPT PDF ===");
        console.log("Appointment ID:", id);
        console.log("Staff ID:", req.user.id);

        // Get appointment details with all related data
        const appointment = await Appointment.findByIdWithAllDetails(id);
        
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Only allow receipts for completed appointments
        if (appointment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Receipt can only be generated for completed appointments'
            });
        }

        // Create PDF document
        const doc = new PDFDocument({ margin: 40, size: "A4" });
        const filename = `receipt-${appointment.id}-${appointment.pet?.name || 'appointment'}.pdf`;

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Pipe PDF to response
        doc.pipe(res);

        // Register fonts (same as walk-in)
        try {
            const fontRegular = path.join(__dirname, "../../assets/fonts/Poppins-Regular.ttf");
            const fontBold = path.join(__dirname, "../../assets/fonts/Poppins-Bold.ttf");
            doc.registerFont("Poppins", fontRegular);
            doc.registerFont("Poppins-Bold", fontBold);
            doc.font("Poppins");
        } catch {
            doc.font("Helvetica");
        }

        // ---------------- HEADER ----------------
        try {
            doc.image(path.join(__dirname, "../../assets/logo.png"), 40, 40, { width: 70 });
        } catch {}
        
        doc.font("Poppins-Bold").fontSize(20).fillColor("#623669")
            .text("Mimi's Pet Grooming", 120, 45)
            .font("Poppins").fontSize(10).fillColor("#555")
            .text("Professional Pet Grooming Services", 120, 70)
            .text("Sitio Mahayahay, Gabi Rd, Cordova, 6017 Cebu", 120, 85)
            .text("Phone: 0928 433 1344 | Email: mimispetcorner@gmail.com", 120, 100);

        // Receipt info block (top-right)
        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669")
            .text(`Receipt #${appointment.id}`, 350, 45, { align: "right" })
            .font("Poppins").fontSize(10)
            .text(`Date: ${new Date(appointment.actual_date || appointment.created_at).toLocaleDateString()}`, { align: "right" })
            .text(`Time: ${formatTimeForReceipt(appointment.actual_time || appointment.preferred_time)}`, { align: "right" });
        
        if (appointment.daily_queue_number) {
            doc.text(`Queue No: ${appointment.daily_queue_number}`, { align: "right" });
        }

        // Divider line
        doc.moveTo(40, 130).lineTo(550, 130).strokeColor("#aaa").stroke();

        // ---------------- CUSTOMER & PET INFO ----------------
        let y = 150;
        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Customer Information", 40, y);
        doc.font("Poppins").fontSize(10).fillColor("#000")
            .text(`Name: ${appointment.owner?.name || appointment.owner_name || 'N/A'}`, 40, y + 20)
            .text(`Contact: ${appointment.owner?.phone || appointment.phone_number || 'N/A'}`, 40, y + 35)
            .text(`Email: ${appointment.owner?.email || appointment.email || 'N/A'}`, 40, y + 50);

        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Pet Information", 300, y);
        doc.font("Poppins").fontSize(10).fillColor("#000")
            .text(`Pet: ${appointment.pet?.name || 'N/A'}`, 300, y + 20)
            .text(`Breed: ${appointment.pet?.breed || 'N/A'}`, 300, y + 35)
            .text(`Type: ${formatSpecies(appointment.pet?.species)}`, 300, y + 50)
            .text(`Size: ${formatPetSize(appointment.pet?.size)}`, 300, y + 65);

        // Divider
        doc.moveTo(40, y + 95).lineTo(550, y + 95).strokeColor("#ccc").stroke();

        // ---------------- SERVICES TABLE ----------------
        y += 110;
        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Services Provided", 40, y);
        y += 25;

        // Table headers
        doc.font("Poppins-Bold").fontSize(10).fillColor("#623669")
            .text("#", 40, y)
            .text("Service", 70, y)
            .text("Price (PHP)", 400, y, { align: "right" });

        y += 15;
        doc.moveTo(40, y).lineTo(550, y).strokeColor("#000").stroke();

        // Services list
        let total = parseFloat(appointment.base_price) || 0;
        let serviceCount = 1;

        // Main service
        doc.font("Poppins").fontSize(10)
            .text(`${serviceCount}`, 40, y + 5)
            .text(appointment.service_name || 'Grooming Service', 70, y + 5)
            .text(parseFloat(appointment.base_price || 0).toFixed(2), 400, y + 5, { align: "right" });
        y += 20;
        serviceCount++;

        // Additional services
        if (appointment.additional_services && appointment.additional_services.length > 0) {
            appointment.additional_services.forEach((service) => {
                const price = parseFloat(service.price || service.service_price || 0);
                doc.text(`${serviceCount}`, 40, y + 5)
                    .text(service.name || service.service_name, 70, y + 5)
                    .text(price.toFixed(2), 400, y + 5, { align: "right" });
                total += price;
                y += 20;
                serviceCount++;
            });
        }

        // Extra fees
        if (appointment.matted_coat_fee && parseFloat(appointment.matted_coat_fee) > 0) {
            const fee = parseFloat(appointment.matted_coat_fee);
            doc.text(`${serviceCount}`, 40, y + 5)
                .text("Matted Coat Fee", 70, y + 5)
                .text(fee.toFixed(2), 400, y + 5, { align: "right" });
            total += fee;
            y += 20;
            serviceCount++;
        }

        // Divider before total
        doc.moveTo(40, y).lineTo(550, y).strokeColor("#000").stroke();
        y += 10;

        // TOTAL
        const finalTotal = parseFloat(appointment.total_amount) || total;
        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669")
            .text("TOTAL", 70, y)
            .text(`PHP ${finalTotal.toFixed(2)}`, 400, y, { align: "right" });

        y += 30;

        // ---------------- PAYMENT INFO ----------------
        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Payment Information", 40, y);
        y += 20;

        // Get payment details
        let paymentMethods = "N/A";
        let paymentStatus = "Pending";
        let totalPaid = 0;

        try {
            // Try to get payment history from database
            const payments = await Payment.findByAppointment(id);
            
            if (payments && payments.length > 0) {
                // Extract unique payment methods from payments
                const uniquePaymentMethods = [...new Set(payments.map(p => p.payment_method))];
                paymentMethods = uniquePaymentMethods.join(", ");
                
                // Calculate total paid amount from ALL successful payments
                totalPaid = payments
                    .filter(p => p.status === 'completed' || p.status === 'paid')
                    .reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
                
                console.log(`Staff Payment debug - Total Paid: ${totalPaid}, Expected Total: ${finalTotal}`);
                
                // CRITICAL FIX: If appointment is marked as paid but payment records don't match,
                // trust the appointment status (cash payments might not be recorded in payments table)
                if (appointment.payment_status === 'paid' && totalPaid < finalTotal) {
                    console.log(`Staff: Discrepancy detected: Appointment marked as paid but payments table shows only ${totalPaid}/${finalTotal}`);
                    console.log(`Assuming cash payment for the difference: PHP ${finalTotal - totalPaid}`);
                    
                    paymentStatus = "Paid";
                    totalPaid = finalTotal; // Trust the appointment total
                    paymentMethods = paymentMethods ? `${paymentMethods}, cash` : 'cash';
                } else {
                    // Normal logic for determining payment status
                    if (totalPaid >= finalTotal) {
                        paymentStatus = "Paid";
                    } else if (totalPaid > 0) {
                        paymentStatus = "Partially Paid";
                    } else {
                        paymentStatus = "Pending";
                    }
                }
                
                console.log(`Staff Payment Methods: ${paymentMethods}`);
                console.log(`Staff Total Paid: ${totalPaid}, Expected: ${finalTotal}`);
                console.log(`Staff Payment Status: ${paymentStatus}`);
            } else {
                // Fallback to appointment payment_method if no payment records
                paymentMethods = appointment.payment_method || "N/A";
                
                // If appointment shows paid but no payment records, trust the appointment status
                if (appointment.payment_status === 'paid') {
                    paymentStatus = "Paid";
                    totalPaid = finalTotal;
                } else {
                    paymentStatus = appointment.payment_status || "Pending";
                }
            }
        } catch (error) {
            console.error("Staff: Error fetching payment details:", error);
            // Fallback values - trust the appointment status
            paymentMethods = appointment.payment_method || "N/A";
            paymentStatus = appointment.payment_status || "Pending";
            
            if (appointment.payment_status === 'paid') {
                paymentStatus = "Paid";
                totalPaid = finalTotal;
            }
        }

        doc.font("Poppins").fontSize(10).fillColor("#623669")
            .text(`Payment Methods: ${paymentMethods}`, 40, y)
            .text(`Payment Status: ${paymentStatus.toUpperCase()}`, 40, y + 15)
            .text(`Amount Paid: PHP ${totalPaid.toFixed(2)}`, 40, y + 30)
            .text(`Total Amount: PHP ${finalTotal.toFixed(2)}`, 40, y + 45);

        // Add payment breakdown
        try {
            const payments = await Payment.findByAppointment(id);
            if (payments && payments.length > 0) {
                y += 70;
                doc.font("Poppins-Bold").fontSize(10).fillColor("#623669").text("Payment Breakdown:", 40, y);
                y += 15;
                
                payments.forEach((payment, index) => {
                    const paymentDate = new Date(payment.created_at || payment.paid_at).toLocaleDateString();
                    const paymentStatus = payment.status === 'completed' || payment.status === 'paid' ? '✓' : '⏳';
                    const paymentText = `${index + 1}. ${payment.payment_method} - PHP ${parseFloat(payment.amount || 0).toFixed(2)} - ${paymentDate} ${paymentStatus}`;
                    doc.font("Poppins").fontSize(9).fillColor("#555").text(paymentText, 40, y);
                    y += 12;
                });
                
                // Add implied cash payment if there's a discrepancy
                if (appointment.payment_status === 'paid' && totalPaid > 0) {
                    const impliedCashAmount = finalTotal - payments
                        .filter(p => p.status === 'completed' || p.status === 'paid')
                        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
                    
                    if (impliedCashAmount > 0) {
                        doc.font("Poppins").fontSize(9).fillColor("#555")
                            .text(`${payments.length + 1}. cash - PHP ${impliedCashAmount.toFixed(2)} - (Paid at counter)`, 40, y);
                        y += 12;
                    }
                }
            }
        } catch (error) {
            console.error("Staff: Error displaying payment breakdown:", error);
        }

        // ---------------- GROOMER INFO ----------------
        if (appointment.groomer || appointment.groomer_name) {
            doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Groomer Information", 40, y);
            doc.font("Poppins").fontSize(10).fillColor("#000")
                .text(`Groomer: ${appointment.groomer?.name || appointment.groomer_name || 'N/A'}`, 40, y + 20);
            y += 50;
        }

        // ---------------- SESSION INFO ----------------
        if (appointment.session_duration) {
            doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Session Details", 40, y);
            doc.font("Poppins").fontSize(10).fillColor("#000")
                .text(`Duration: ${formatDuration(appointment.session_duration)}`, 40, y + 20);
            
            if (appointment.session_data?.start_time) {
                doc.text(`Started: ${new Date(appointment.session_data.start_time).toLocaleString()}`, 40, y + 35);
            }
            
            if (appointment.session_data?.end_time) {
                doc.text(`Completed: ${new Date(appointment.session_data.end_time).toLocaleString()}`, 40, y + 50);
            }
            
            y += 70;
        }

        // ---------------- FOOTER ----------------
        doc.font("Poppins-Bold").fontSize(12).fillColor("#623669")
            .text("Thank you for trusting Mimi's Pet Grooming!", 40, y, { align: "center" });
        doc.font("Poppins").fontSize(9).fillColor("#555")
            .text("This receipt is system-generated. No signature required.", 40, y + 20, { align: "center" });

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('❌ Staff error generating receipt:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating receipt',
            error: error.message
        });
    }
};

// Helper function to format time for receipt
function formatTimeForReceipt(timeStr) {
    if (!timeStr) return 'N/A';
    
    // If already in 12-hour format, return as-is
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
        return timeStr;
    }
    
    // Convert 24-hour to 12-hour format
    try {
        const [hours, minutes] = timeStr.split(':');
        const hourInt = parseInt(hours, 10);
        
        if (isNaN(hourInt)) return timeStr;
        
        const period = hourInt >= 12 ? 'PM' : 'AM';
        const hour12 = hourInt % 12 || 12;
        
        return `${hour12}:${minutes || '00'} ${period}`;
    } catch {
        return timeStr;
    }
}

// Helper function to format species
function formatSpecies(species) {
    if (!species) return 'N/A';
    return species.charAt(0).toUpperCase() + species.slice(1);
}

// Helper function to format pet size
function formatPetSize(size) {
    if (!size) return 'Medium';
    const sizeMap = {
        'xs': 'Extra Small',
        'XS': 'Extra Small',
        'small': 'Small',
        'Small': 'Small',
        'medium': 'Medium',
        'Medium': 'Medium',
        'large': 'Large',
        'Large': 'Large',
        'xl': 'XL',
        'XL': 'XL',
        'xxl': 'XXL',
        'XXL': 'XXL'
    };
    return sizeMap[size] || size;
}

// Helper function to format duration
function formatDuration(minutes) {
    if (!minutes) return 'Not recorded';
    
    const totalMinutes = typeof minutes === 'string' ? parseInt(minutes) : minutes;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours > 0 && mins > 0) {
        return `${hours}h ${mins}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else if (mins > 0) {
        return `${mins} minutes`;
    } else {
        return '0 minutes';
    }
}

exports.startAppointmentSession = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🔄 Staff starting appointment session:', { appointment_id: id, staff_id: req.user.id });
        
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        // ✅ Only allow confirmed or waiting appointments
        const allowedStatuses = ['confirmed', 'waiting'];
        if (!allowedStatuses.includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot start session for ${appointment.status} appointment. Only confirmed or waiting appointments can be started.`
            });
        }

        // ✅ Must have groomer assigned
        if (!appointment.groomer_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Assign a groomer before starting the session', 
                requiresGroomer: true 
            });
        }

        // ✅ Prevent duplicate active session
        const [existing] = await db.execute(
            'SELECT id FROM appointment_sessions WHERE appointment_id = ? AND status = "active" LIMIT 1',
            [id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Session already active for this appointment' });
        }

        // ✅ Ensure actual start timestamps
        const now = new Date();
        const sessionStartDate = now.toISOString().split('T')[0];
        const sessionStartTime = now.toTimeString().split(' ')[0];

        // ✅ Queue handling - assign only if not yet assigned
        const today = new Date().toISOString().split('T')[0];
        let queueNumber = appointment.daily_queue_number;
        let queueDate = appointment.queue_date;

        if (!queueNumber) {
            console.log(`Staff: Assigning queue number for first time for appointment ${id}`);
            queueNumber = await Appointment.assignDailyQueueNumber(id);
            queueDate = today;
        } else {
            console.log(`Staff: Keeping existing queue number ${queueNumber} for appointment ${id}`);
            queueDate = queueDate || today;
        }

        // ✅ Update appointment
        await Appointment.update(id, {
            status: 'in_progress',
            actual_date: sessionStartDate,  // Always use current time
            actual_time: sessionStartTime,  // Always use current time
            session_start_time: now.toISOString(), // For precise duration tracking
            daily_queue_number: queueNumber,
            queue_date: queueDate
        });

        // ✅ Create session row
        const [insert] = await db.execute(
            `INSERT INTO appointment_sessions (appointment_id, groomer_id, start_time, status)
             VALUES (?, ?, NOW(), 'active')`,
            [id, appointment.groomer_id]
        );

        const [sessionRows] = await db.execute(
            'SELECT * FROM appointment_sessions WHERE id = ?', 
            [insert.insertId]
        );

        // ✅ Send notification after status change
        if (appointment.owner_id) {
            try {
                const updatedAppointment = await Appointment.findByIdWithPetDetails(id);
                const petName = updatedAppointment.pet?.name || 'your pet';
                const title = 'Appointment IN SESSION';
                const message = `Your appointment for ${petName} is now in session - your pet is being groomed!`;

                // Save to DB
                const dbNotification = await Notification.create(
                    appointment.owner_id,
                    title,
                    message,
                    'appointment'
                );

                // Real-time notification
                sendNotificationToUser(appointment.owner_id, {
                    notification: {
                        id: dbNotification.id,
                        title,
                        message,
                        type: 'appointment',
                        is_read: false,
                        created_at: new Date().toISOString(),
                        appointment_id: parseInt(id)
                    }
                });

                console.log('📨 Staff notification sent for in_progress status to user:', appointment.owner_id);
            } catch (notificationError) {
                console.error('❌ Staff error sending in_progress notification:', notificationError);
            }
        }
 // Add this logging here:
 await ActivityLogger.log(
    req.user,
    'STARTED_SESSION',
    'APPOINTMENT',
    `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
    `Started grooming session | Queue: ${queueNumber} | Groomer: ${appointment.groomer_id}`,
    req
);
        return res.status(200).json({
            success: true,
            message: 'Appointment session started successfully',
            data: {
                appointment_id: id,
                session_id: sessionRows[0].id,
                started_by: req.user.name
            }
        });
    } catch (error) {
        console.error('❌ Staff error starting appointment session:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to start appointment session', 
            error: error.message 
        });
    }
};

// End grooming session for an appointment
exports.endAppointmentSession = async (req, res) => {
    try {
        const { id } = req.params;
        const { send_notification } = req.body;

        console.log('🔄 Staff ending appointment session:', { appointment_id: id, staff_id: req.user.id });

        const [sessions] = await db.execute(
            `SELECT * FROM appointment_sessions WHERE appointment_id = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1`,
            [id]
        );
        if (sessions.length === 0) {
            return res.status(400).json({ success: false, message: 'No active session found for this appointment' });
        }

        const session = sessions[0];

        // Get appointment details for notification
        const appointment = await Appointment.findById(id);

        // Compute duration in minutes SQL-side
        const [durRows] = await db.execute(
            `SELECT TIMESTAMPDIFF(MINUTE, start_time, NOW()) AS minutes FROM appointment_sessions WHERE id = ?`,
            [session.id]
        );
        const durationMinutes = Math.max(0, parseInt(durRows[0]?.minutes || 0));

        // Update session and appointment
        await db.execute(
            `UPDATE appointment_sessions SET end_time = NOW(), duration_minutes = ?, status = 'completed' WHERE id = ?`,
            [durationMinutes, session.id]
        );

        // Mark appointment completed and persist duration
        const now = new Date();
        await Appointment.update(id, {
            status: 'completed',
            duration_minutes: durationMinutes,
            actual_date: now.toISOString().split('T')[0],
            actual_time: now.toTimeString().split(' ')[0]
        });

        // Send notification when session is completed
        if (appointment.owner_id && send_notification) {
            try {
                const updatedAppointment = await Appointment.findByIdWithPetDetails(id);
                const petName = updatedAppointment.pet?.name || 'your pet';
                const title = 'Grooming Completed';
                const message = `Your appointment for ${petName} has been completed! Your pet is ready for pickup.`;

                // Save to database
                const dbNotification = await Notification.create(
                    appointment.owner_id,
                    title,
                    message,
                    'appointment'
                );
                
                // Send real-time notification
                sendNotificationToUser(appointment.owner_id, {
                    notification: {
                        id: dbNotification.id,
                        title: title,
                        message: message,
                        type: 'appointment',
                        is_read: false,
                        created_at: new Date().toISOString(),
                        appointment_id: parseInt(id)
                    }
                });
                
                console.log('Staff notification sent for completed status to user:', appointment.owner_id);
                
            } catch (notificationError) {
                console.error('Staff error sending completion notification:', notificationError);
            }
        }
  // Add this logging here:
  await ActivityLogger.log(
    req.user,
    'COMPLETED_SESSION',
    'APPOINTMENT',
    `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
    `Completed grooming session | Duration: ${durationMinutes} minutes | Notification sent: ${!!(appointment.owner_id && send_notification)}`,
    req
);
        return res.status(200).json({
            success: true,
            message: 'Appointment session completed',
            data: {
                appointment_id: id,
                session_id: session.id,
                durationMinutes,
                completed_by: req.user.name
            },
            notification_sent: !!(appointment.owner_id && send_notification)
        });
    } catch (error) {
        console.error('Staff error ending appointment session:', error);
        return res.status(500).json({ success: false, message: 'Failed to end appointment session', error: error.message });
    }
};

exports.cancelAppointmentWithReason = async (req, res) => {
    try {
        const { id } = req.params;
        const { cancelled_reason } = req.body;

        console.log('🔴 Staff cancelling appointment:', {
            id,
            staff_id: req.user.id,
            staff_name: req.user.name,
            reason: cancelled_reason?.substring(0, 50)
        });

        // Validate required fields
        if (!cancelled_reason) {
            return res.status(400).json({
                success: false,
                message: 'Cancellation reason is required'
            });
        }

        // Verify appointment exists
        const appointment = await Appointment.findByIdWithPetDetails(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if appointment is already cancelled
        if (appointment.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Appointment is already cancelled'
            });
        }

        // Staff cancellation - ISSUE REFUND if paid
        let refundStatus = 'not_refunded';
        if (appointment.payment_status === 'paid') {
            refundStatus = 'refunded';
            console.log('💰 Staff cancellation - refund would be processed for appointment:', id);
        }

        // Update appointment with cancellation details
        await db.execute(`
            UPDATE appointments 
            SET 
                status = 'cancelled',
                refund_status = ?,
                cancelled_reason = ?,
                cancelled_by_role = 'staff',
                cancelled_by_user_id = ?,
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
        `, [
            refundStatus,
            cancelled_reason,
            req.user.id,
            id
        ]);

        // Send real-time notification for cancellation
        if (appointment.owner_id) {
            try {
                const refundMessage = refundStatus === 'refunded' 
                    ? ' A refund will be processed.' 
                    : '';
                    
                const message = `Your appointment for ${appointment.pet?.name || 'your pet'} has been cancelled by our staff.${refundMessage}`;
                
                // Save to database
                const dbNotification = await Notification.create(
                    appointment.owner_id,
                    'Appointment Cancelled',
                    message,
                    'appointment'
                );
                
                // Send real-time notification
                sendNotificationToUser(appointment.owner_id, {
                    id: dbNotification.id,
                    title: 'Appointment Cancelled',
                    message: message,
                    type: 'appointment',
                    is_read: false,
                    created_at: new Date(),
                    appointment_id: id
                });
                
                console.log('📨 Staff cancellation notification sent to user:', appointment.owner_id);
                
            } catch (notificationError) {
                console.error('❌ Staff error sending cancellation notification:', notificationError);
            }
        }

        console.log('✅ Appointment cancelled successfully by staff:', {
            appointment_id: id,
            cancelled_by_staff: req.user.name,
            cancelled_by_user_id: req.user.id,
            original_payment_status: appointment.payment_status,
            refund_status: refundStatus
        });
 // Add this logging here:
 await ActivityLogger.log(
    req.user,
    'CANCELLED',
    'APPOINTMENT',
    `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
    `Cancelled appointment | Reason: ${cancelled_reason} | Original Payment: ${appointment.payment_status} | Refund Status: ${refundStatus}`,
    req
);
        return res.status(200).json({
            success: true,
            data: {
                appointment_id: id,
                cancelled_by_role: 'staff',
                cancelled_by_user_id: req.user.id,
                cancelled_by_name: req.user.name,
                cancelled_at: new Date(),
                payment_status: appointment.payment_status,
                refund_status: refundStatus
            }
        });

    } catch (error) {
        console.error('❌ Staff error cancelling appointment:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel appointment',
            error: error.message
        });
    }
};

exports.rescheduleAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { preferred_date, preferred_time, reschedule_reason } = req.body;

        console.log('🔄 Staff reschedule request:', {
            appointmentId,
            preferred_date,
            preferred_time,
            reschedule_reason,
            staff_id: req.user.id,
            staff_name: req.user.name
        });

        // Validate appointment ID
        if (!appointmentId || appointmentId === 'undefined' || appointmentId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Invalid appointment ID provided'
            });
        }

        // Validate required fields
        if (!preferred_date || !preferred_time) {
            return res.status(400).json({
                success: false,
                message: 'New date and time are required for rescheduling'
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(preferred_date)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Please use YYYY-MM-DD format.'
            });
        }

        // Get existing appointment with full details
        console.log(`🔍 Staff fetching appointment details for ID: ${appointmentId}`);
        const appointment = await Appointment.findByIdWithPetDetails(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        console.log('✅ Staff appointment found:', {
            id: appointment.id,
            owner: appointment.owner_name,
            pet: appointment.pet?.name,
            current_schedule: `${appointment.preferred_date} at ${appointment.preferred_time}`
        });

        // Check if appointment can be rescheduled
        if (['completed', 'no_show'].includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot reschedule ${appointment.status} appointment. Please create a new appointment instead.`
            });
        }

        // Validate new date is not in the past
        const newDate = new Date(preferred_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (newDate < today) {
            return res.status(400).json({
                success: false,
                message: 'New date cannot be in the past'
            });
        }

        // Convert time to 24-hour format for database storage
        let formattedTime = preferred_time;

        if (preferred_time.includes('AM') || preferred_time.includes('PM')) {
            formattedTime = convertTo24Hour(preferred_time);
        }

        console.log('⏰ Staff time conversion for database:', {
            input: preferred_time,
            formatted: formattedTime
        });

        // Check for time slot availability
        const [conflictRows] = await db.execute(
            `SELECT id, owner_id, pet_id 
             FROM appointments 
             WHERE preferred_date = ? 
             AND preferred_time = ? 
             AND id != ?
             AND status NOT IN ('cancelled', 'completed', 'no_show')`,
            [preferred_date, formattedTime, appointmentId]
        );

        if (conflictRows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'TIME_SLOT_UNAVAILABLE',
                error: 'The selected time slot is already booked. Please choose a different time.'
            });
        }

        // Save reschedule history
        await db.execute(`
            INSERT INTO appointment_reschedule_history 
            (appointment_id, old_preferred_date, old_preferred_time, new_preferred_date, new_preferred_time, reason, rescheduled_by_role, rescheduled_by_user_id)
            VALUES (?, ?, ?, ?, ?, ?, 'staff', ?)
        `, [
            appointmentId,
            appointment.preferred_date,
            appointment.preferred_time,
            preferred_date,
            formattedTime,
            reschedule_reason || `Rescheduled by staff: ${req.user.name}`,
            req.user.id
        ]);

        console.log('✅ Staff reschedule history saved:', {
            appointmentId,
            oldPreferredSchedule: `${appointment.preferred_date} ${appointment.preferred_time}`,
            newPreferredSchedule: `${preferred_date} ${formattedTime}`,
            rescheduled_by: req.user.name
        });

        // Update appointment
        const updateData = {
            preferred_date,
            preferred_time: formattedTime
        };

        console.log('💾 Staff updating appointment with data:', updateData);
        const updateResult = await Appointment.update(appointmentId, updateData);

        if (!updateResult.success) {
            throw new Error('Failed to update appointment');
        }

        // Get updated appointment
        const updatedAppointment = await Appointment.findByIdWithPetDetails(appointmentId);

        console.log('✅ Staff appointment rescheduled successfully:', {
            appointmentId,
            oldDate: appointment.preferred_date,
            oldTime: appointment.preferred_time,
            newDate: preferred_date,
            newTime: formattedTime,
            customer: updatedAppointment.owner_name,
            pet: updatedAppointment.pet?.name,
            rescheduled_by: req.user.name
        });
         // Add this logging here:
         await ActivityLogger.log(
            req.user,
            'RESCHEDULED',
            'APPOINTMENT',
            `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
            `Rescheduled appointment | Old: ${formatDateForLog(appointment.preferred_date)} ${formatTimeForLog(appointment.preferred_time)} | New: ${formatDateForLog(preferred_date)} ${formatTimeForLog(preferred_time)} | Reason: ${reschedule_reason || 'Staff initiated'}`,        );
        // Send real-time notification
        if (appointment.owner_id) {
            try {
                const readableTime = convertTo12HourFormat(preferred_time);
                const message = `Your appointment for ${appointment.pet?.name || 'your pet'} has been rescheduled to ${preferred_date} at ${readableTime} by our staff.`;

                // Save notification to DB
                const dbNotification = await Notification.create(
                    appointment.owner_id,
                    'Appointment Rescheduled',
                    message,
                    'appointment'
                );

                // Emit to Socket.IO
                const io = req.app.get('io');
                io.to(`user_${appointment.owner_id}`).emit('receiveNotification', {
                    id: dbNotification.id,
                    title: 'Appointment Rescheduled',
                    message,
                    type: 'appointment',
                    is_read: false,
                    created_at: new Date(),
                    appointment_id: appointmentId
                });

                console.log('📨 Staff real-time reschedule notification sent:', {
                    to: appointment.owner_id,
                    message,
                    rescheduled_by: req.user.name
                });

            } catch (notificationError) {
                console.error('❌ Staff error sending real-time notification:', notificationError);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Appointment rescheduled successfully',
            data: {
                appointment: updatedAppointment,
                changes: {
                    old_schedule: {
                        date: appointment.preferred_date,
                        time: appointment.preferred_time
                    },
                    new_schedule: {
                        date: preferred_date,
                        time: preferred_time
                    },
                    rescheduled_by: 'staff',
                    rescheduled_by_name: req.user.name,
                    rescheduled_at: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        console.error('❌ Staff error rescheduling appointment:', error);

        if (error.message === 'TIME_SLOT_UNAVAILABLE') {
            return res.status(409).json({
                success: false,
                message: 'The selected time slot is no longer available',
                error: 'Please choose a different date or time'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error rescheduling appointment',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// UPDATE APPOINTMENT STATUS with Socket.io notifications
exports.updateAppointmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        const validStatuses = ['pending', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}`
            });
        }

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        const updateData = { status };
        if (notes) updateData.special_notes = notes;

        // When moving to waiting status, use DAILY queue system
        if (status === 'waiting') {
            const today = new Date().toISOString().split('T')[0];
            const now = new Date();

            // Use daily queue system instead of old queue_number
            if (!appointment.queue_date || appointment.queue_date !== today) {
                const queueNumber = await Appointment.assignDailyQueueNumber(id);
                updateData.daily_queue_number = queueNumber;
                updateData.queue_date = today;
            }

            // Set actual start if not set
            if (!appointment.actual_date || !appointment.actual_time) {
                updateData.actual_date = today;
                updateData.actual_time = now.toTimeString().split(' ')[0];
            }
        }

        // When starting in-progress, ensure actual start and queue
        if (status === 'in_progress') {
            const now = new Date();

            if (!appointment.actual_date || !appointment.actual_time) {
                updateData.actual_date = now.toISOString().split('T')[0];
                updateData.actual_time = now.toTimeString().split(' ')[0];
            }
        }
        
        // If marking as no_show, set actual date/time to today
        if (status === 'no_show') {
            const now = new Date();
            updateData.actual_date = now.toISOString().split('T')[0];
            updateData.actual_time = now.toTimeString().split(' ')[0];
        }

        // If marking as completed, set actual date/time and duration
        if (status === 'completed') {
            const now = new Date();
            if (!appointment.actual_date) {
                updateData.actual_date = now.toISOString().split('T')[0];
            }
            if (!appointment.actual_time) {
                updateData.actual_time = now.toTimeString().split(' ')[0];
            }

            try {
                const [sessionRows] = await db.execute(
                    `SELECT TIMESTAMPDIFF(MINUTE, start_time, NOW()) AS minutes 
                     FROM appointment_sessions 
                     WHERE appointment_id = ? AND status = 'active' 
                     ORDER BY start_time DESC LIMIT 1`,
                    [id]
                );

                if (sessionRows.length > 0) {
                    const durationMinutes = Math.max(1, parseInt(sessionRows[0]?.minutes || 1));
                    updateData.duration_minutes = durationMinutes;
                } else {
                    updateData.duration_minutes = 1;
                }
            } catch (e) {
                console.warn('Staff: Could not compute duration_minutes for appointment', id, e?.message);
                updateData.duration_minutes = 1;
            }
        }

        await Appointment.update(id, updateData);
        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        // Add this logging here:
        await ActivityLogger.log(
            req.user,
            'UPDATED',
            'APPOINTMENT',
            `${updatedAppointment.pet?.name || 'Pet'} (${updatedAppointment.owner_name || 'Unknown Owner'})`,
            `Updated appointment status to "${status}" | Queue: ${updateData.daily_queue_number || 'N/A'} | Duration: ${updateData.duration_minutes || 'N/A'} minutes`,
            req
        );

        // Send real-time notification to pet owner
        if (appointment.owner_id) {
            try {
                const statusMessages = {
                    'confirmed': 'has been confirmed',
                    'cancelled': 'has been cancelled', 
                    'completed': 'has been completed',
                    'in_progress': 'is now in session - your pet is being groomed!',
                    'waiting': 'is now waiting in queue',
                    'no_show': 'was marked as no-show'
                };

                const message = statusMessages[status] 
                    ? `Your appointment for ${updatedAppointment.pet?.name || 'your pet'} ${statusMessages[status]}.`
                    : `Your appointment status has been updated to ${status}.`;

                // Save to database
                const dbNotification = await Notification.create(
                    appointment.owner_id,
                    `Appointment ${status.replace('_', ' ').toUpperCase()}`,
                    message,
                    'appointment'
                );
                
                // Send real-time notification via Socket.io
                sendNotificationToUser(appointment.owner_id, {
                    id: dbNotification.id,
                    title: `Appointment ${status.replace('_', ' ').toUpperCase()}`,
                    message: message,
                    type: 'appointment',
                    is_read: false,
                    created_at: new Date(),
                    appointment_id: id
                });
                
                console.log('📨 Staff status notification sent:', {
                    status: status,
                    user_id: appointment.owner_id,
                    appointment_id: id,
                    updated_by: req.user.name
                });
                
            } catch (notificationError) {
                console.error('❌ Staff error sending status notification:', notificationError);
            }
        }

        res.status(200).json({
            success: true,
            message: `Appointment status updated to ${status}`,
            data: updatedAppointment,
            notification_sent: !!appointment.owner_id,
            updated_by: req.user.name
        });

    } catch (error) {
        console.error('❌ Staff error updating appointment status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating appointment status',
            error: error.message
        });
    }
};

// Mark as waiting with daily queue
exports.markAsWaiting = async (req, res) => {
    try {
        const { id } = req.params;
        const appointment = await Appointment.findById(id);

        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        // Only assign queue number if it doesn't have one for today
        let queueNumber = appointment.daily_queue_number;
        if (!queueNumber || appointment.queue_date !== today) {
            queueNumber = await Appointment.assignDailyQueueNumber(id);
        }

        await Appointment.update(id, {
            status: 'waiting',
            daily_queue_number: queueNumber,
            queue_date: today,
            actual_date: appointment.actual_date || today,
            actual_time: appointment.actual_time || now.toTimeString().split(' ')[0]
        });

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: 'Appointment marked as waiting',
            data: updatedAppointment,
            queue_number: queueNumber,
            updated_by: req.user.name
        });
    } catch (error) {
        console.error('Staff error marking appointment as waiting:', error);
        res.status(500).json({ success: false, message: 'Failed to mark appointment as waiting', error: error.message });
    }
};

// Get today's queue
exports.getTodaysQueue = async (req, res) => {
    try {
        const queue = await Appointment.getTodaysQueue();

        res.status(200).json({
            success: true,
            data: queue,
            count: queue.length
        });
    } catch (error) {
        console.error('Staff error fetching today queue:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching today queue',
            error: error.message
        });
    }
};

// Get current queue
exports.getCurrentQueue = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [queueAppointments] = await db.execute(`
            SELECT 
                a.id,
                a.status,
                a.daily_queue_number as queue_number,
                a.preferred_date,
                a.actual_date,
                a.preferred_time,
                a.actual_time,
                a.groomer_id,
                p.name as pet_name,
                u.name as owner_name,
                g.name as groomer_name
                FROM appointments a
                LEFT JOIN pets p ON a.pet_id = p.id
                LEFT JOIN users u ON a.owner_id = u.id
                LEFT JOIN users g ON a.groomer_id = g.id
                WHERE a.queue_date = ? 
                AND a.status IN ('waiting', 'in_progress')
                ORDER BY 
                a.daily_queue_number ASC,
                a.status ASC,
                COALESCE(a.actual_time, a.preferred_time) ASC
                `, [today]);

        res.status(200).json({
            success: true,
            data: queueAppointments,
            count: queueAppointments.length
        });
    } catch (error) {
        console.error('❌ Staff error fetching current queue:', error);
        res.status(500).json({ success: false, message: 'Error fetching queue', error: error.message });
    }
};

// Update appointment pricing
exports.updateAppointmentPricing = async (req, res) => {
    try {
        const { id } = req.params;
        const { base_price, matted_coat_fee, additional_fees, discount } = req.body;

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        const updateData = {};

        if (base_price !== undefined) updateData.base_price = parseFloat(base_price);
        if (matted_coat_fee !== undefined) updateData.matted_coat_fee = parseFloat(matted_coat_fee);

        // Calculate new total
        const newBasePrice = updateData.base_price || parseFloat(appointment.base_price);
        const newMattedFee = updateData.matted_coat_fee || parseFloat(appointment.matted_coat_fee || 0);
        const additionalAmount = parseFloat(additional_fees || 0);
        const discountAmount = parseFloat(discount || 0);

        updateData.total_amount = newBasePrice + newMattedFee + additionalAmount - discountAmount;

        await Appointment.update(id, updateData);

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: 'Appointment pricing updated successfully',
            data: updatedAppointment,
            updated_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error updating appointment pricing:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating appointment pricing',
            error: error.message
        });
    }
};

// Add service to existing appointment
exports.addServiceToAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { service_id, pet_id, payment_method, preserve_payment_status, matted_coat_fee } = req.body;

        console.log('🔄 Staff adding service to appointment:', {
            appointment_id: id,
            service_id,
            pet_id,
            payment_method,
            matted_coat_fee,
            staff_id: req.user.id
        });

        // Get the appointment
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        // Get the service details
        const service = await GroomingService.findById(service_id);
        if (!service) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        // Validate pet_id and get pet size
        if (!pet_id) {
            return res.status(400).json({
                success: false,
                message: 'pet_id is required to calculate the service price'
            });
        }

        const [petRows] = await db.execute('SELECT size FROM pets WHERE id = ?', [pet_id]);
        const pet = petRows[0];

        if (!pet || !pet.size) {
            return res.status(404).json({
                success: false,
                message: 'Pet or pet size not found for the given pet_id'
            });
        }

        // Check for duplicate services
        if (appointment.service_id == service_id) {
            return res.status(400).json({
                success: false,
                message: `"${service.name}" is already the main service for this appointment.`,
                error_type: 'primary_service_conflict'
            });
        }

        const [existingServices] = await db.execute(
            `SELECT id, created_at, price, payment_method 
             FROM appointment_services 
             WHERE appointment_id = ? AND service_id = ?`,
            [id, service_id]
        );

        if (existingServices.length > 0) {
            const existing = existingServices[0];
            return res.status(400).json({
                success: false,
                message: `"${service.name}" was already added on ${new Date(existing.created_at).toLocaleDateString()}.`,
                error_type: 'additional_service_duplicate',
                existing_service: existing
            });
        }

        // Calculate the price based on pet size
        const pet_size = pet.size;
        const priceField = `price_${pet_size.toLowerCase()}`;
        const price = parseFloat(service[priceField] || service.price_medium || 0);

        if (price <= 0) {
            return res.status(400).json({
                success: false,
                message: `No valid price found for ${pet_size} pets for service "${service.name}"`
            });
        }

        console.log('💰 Staff calculated service price:', { pet_size, price });

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Add the service
            const [insertResult] = await connection.execute(
                `INSERT INTO appointment_services 
                 (appointment_id, service_id, pet_id, price, payment_method, created_at) 
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [id, service_id, pet_id, price, payment_method || 'cash']
            );

            // Matted coat fee + pricing update
            const updateData = {};

            if (matted_coat_fee !== undefined && matted_coat_fee !== null) {
                updateData.matted_coat_fee = parseFloat(matted_coat_fee);
            }

            const newBasePrice = parseFloat(appointment.base_price || 0);
            const newMattedFee = updateData.matted_coat_fee || parseFloat(appointment.matted_coat_fee || 0);
            const additionalAmount = price;
            const discountAmount = 0;

            updateData.total_amount = newBasePrice + newMattedFee + additionalAmount - discountAmount;

            await connection.execute(
                'UPDATE appointments SET total_amount = ?, matted_coat_fee = ?, updated_at = NOW() WHERE id = ?',
                [updateData.total_amount, newMattedFee, id]
            );

            console.log('💰 Staff updated total amount with matted coat fee:', updateData);

            // Payment status logic
            if (!preserve_payment_status) {
                let newPaymentStatus = 'pending';

                const hasSuccessfulPayment = await Payment.hasSuccessfulPayment(id);

                if (hasSuccessfulPayment) {
                    newPaymentStatus = 'pending';
                } else if (appointment.payment_status === 'paid') {
                    newPaymentStatus = 'paid';
                }

                await connection.execute(
                    'UPDATE appointments SET payment_status = ? WHERE id = ?',
                    [newPaymentStatus, id]
                );
            }

            // Commit
            await connection.commit();
            connection.release();

             // Add this logging here:
             await ActivityLogger.log(
                req.user,
                'ADDED_SERVICE',
                'APPOINTMENT',
                `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
                `Added service "${service.name}" | Price: PHP ${price} | New Total: PHP ${updateData.total_amount} | Matted Fee: PHP ${newMattedFee || 0}`,
                req
            );

            // Fetch updated appointment
            const updatedAppointment = await Appointment.findByIdWithAllDetails(id);

            // Final response
            res.status(200).json({
                success: true,
                message: `"${service.name}" added to appointment successfully`,
                data: updatedAppointment,
                addedService: {
                    id: service_id,
                    name: service.name,
                    price: price,
                    payment_method: payment_method || 'cash',
                    pet_size: pet_size,
                    appointment_service_id: insertResult.insertId
                },
                matted_coat_fee: newMattedFee,
                summary: {
                    previous_total: parseFloat(appointment.total_amount || 0),
                    service_price: price,
                    new_total: updateData.total_amount,
                    total_additional_services: updatedAppointment.additional_services?.length || 0,
                    matted_coat_fee: newMattedFee
                },
                updated_by: req.user.name
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Staff error adding service to appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding service to appointment',
            error: error.message
        });
    }
};

// Remove service from appointment
exports.removeServiceFromAppointment = async (req, res) => {
    try {
        const { id, serviceId } = req.params;

        console.log('🗑️ Staff removing service from appointment:', {
            appointment_id: id,
            service_id: serviceId,
            staff_id: req.user.id
        });

        // Get the appointment
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if service exists in additional services
        const [serviceRows] = await db.execute(`
            SELECT aps.id, aps.price, gs.name as service_name
            FROM appointment_services aps
            JOIN grooming_services gs ON aps.service_id = gs.id
            WHERE aps.appointment_id = ? AND aps.service_id = ?
        `, [id, serviceId]);

        if (serviceRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service not found in this appointment'
            });
        }

        const serviceToRemove = serviceRows[0];
        const servicePrice = parseFloat(serviceToRemove.price);

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Remove the service
            await connection.execute(
                'DELETE FROM appointment_services WHERE appointment_id = ? AND service_id = ?',
                [id, serviceId]
            );

            // Update total amount
            const currentTotal = parseFloat(appointment.total_amount);
            const newTotal = currentTotal - servicePrice;

            await connection.execute(
                'UPDATE appointments SET total_amount = ?, updated_at = NOW() WHERE id = ?',
                [newTotal, id]
            );

            await connection.commit();
            connection.release();

            console.log('✅ Staff service removed successfully:', {
                service_name: serviceToRemove.service_name,
                price_removed: servicePrice,
                new_total: newTotal,
                staff_id: req.user.id
            });

            // Get updated appointment
            const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

            res.status(200).json({
                success: true,
                message: `Service "${serviceToRemove.service_name}" removed successfully`,
                data: updatedAppointment,
                removedService: {
                    name: serviceToRemove.service_name,
                    price: servicePrice
                },
                summary: {
                    previous_total: currentTotal,
                    removed_amount: servicePrice,
                    new_total: newTotal
                },
                updated_by: req.user.name
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Staff error removing service from appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing service from appointment',
            error: error.message
        });
    }
};

// Get available services
exports.getAvailableServices = async (req, res) => {
    try {
        console.log('🔍 Staff fetching available services for appointments');

        const services = await GroomingService.findAvailable();

        console.log(`✅ Found ${services.length} available services`);

        const transformedServices = services.map(service => ({
            id: service.id,
            name: service.name,
            description: service.description,
            category: service.category,
            image_url: service.image_url,
            time_description: service.time_description,
            status: service.status,
            price_xs: parseFloat(service.price_xs || 0),
            price_small: parseFloat(service.price_small || 0),
            price_medium: parseFloat(service.price_medium || 0),
            price_large: parseFloat(service.price_large || 0),
            price_xl: parseFloat(service.price_xl || 0),
            price_xxl: parseFloat(service.price_xxl || 0),
            price: parseFloat(service.price_medium || 0),
            created_at: service.created_at,
            updated_at: service.updated_at
        }));

        res.status(200).json({
            success: true,
            data: transformedServices,
            count: transformedServices.length,
            message: `Found ${transformedServices.length} available services`
        });
    } catch (error) {
        console.error('❌ Staff error fetching available services:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available services',
            error: error.message
        });
    }
};

// Get available groomers
exports.getAvailableGroomers = async (req, res) => {
    try {
        console.log('🔍 Staff fetching available groomers');

        const groomers = await User.findGroomers({
            status: 'Active'
        });

        res.status(200).json({
            success: true,
            data: groomers,
            count: groomers.length
        });
    } catch (error) {
        console.error('❌ Staff error fetching available groomers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available groomers',
            error: error.message
        });
    }
};

// Get appointment payments
exports.getAppointmentPayments = async (req, res) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        const payments = await Payment.findByAppointment(id);

        res.status(200).json({
            success: true,
            appointment_id: id,
            appointment_status: appointment.payment_status,
            total_amount: appointment.total_amount,
            payments: payments
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointment payments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching payment details',
            error: error.message
        });
    }
};

// Process cash payment
exports.processCashPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount_received, change_given = 0, notes } = req.body;

        console.log('💰 Staff processing cash payment:', {
            appointment_id: id,
            amount_received,
            change_given,
            staff_id: req.user.id
        });

        const appointment = await Appointment.findByIdWithPetDetails(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check for existing payments
        const existingPayments = await Payment.findByAppointment(id);
        const hasCompletedPayment = existingPayments.some(p => p.status === 'completed');

        if (hasCompletedPayment) {
            return res.status(400).json({
                success: false,
                message: 'Payment has already been processed for this appointment'
            });
        }

        const totalAmount = parseFloat(appointment.total_amount);
        const received = parseFloat(amount_received);

        if (received < totalAmount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient payment. Required: ₱${totalAmount}, Received: ₱${received}`
            });
        }

        // Use database transaction for atomicity
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Create payment record
            const paymentData = {
                appointment_id: id,
                user_id: appointment.owner_id,
                amount: totalAmount,
                payment_method: 'cash',
                status: 'completed',
                external_reference: `CASH-${Date.now()}`,
                paid_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                notes: notes || `Cash payment processed by ${req.user.name}. Received: ₱${received}, Change: ₱${change_given}`
            };

            const paymentId = await Payment.create(paymentData);

            // Update appointment with both status AND method
            await connection.execute(
                'UPDATE appointments SET payment_status = ?, payment_method = ?, updated_at = NOW() WHERE id = ?',
                ['paid', 'cash', id]
            );

            await connection.commit();
            connection.release();

            console.log(`✅ Staff cash payment processed successfully for appointment ${id}`);

             // Add this logging here:
             await ActivityLogger.log(
                req.user,
                'PROCESSED_PAYMENT',
                'APPOINTMENT',
                `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
                `Processed cash payment | Amount: PHP ${totalAmount} | Received: PHP ${received} | Change: PHP ${change_given}`,
                req
            );

            const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

            res.status(200).json({
                success: true,
                message: 'Cash payment processed successfully',
                data: updatedAppointment,
                payment_id: paymentId,
                payment_details: {
                    total_amount: totalAmount,
                    amount_received: received,
                    change_given: change_given
                },
                processed_by: req.user.name
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Staff error processing cash payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing cash payment',
            error: error.message
        });
    }
};

// Mark payment as paid
exports.markPaymentAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            payment_method = 'cash',
            transaction_id,
            reference_number,
            notes
        } = req.body;

        console.log('💰 Staff marking payment as paid:', {
            appointment_id: id,
            payment_method,
            staff_id: req.user.id
        });

        const appointment = await Appointment.findByIdWithPetDetails(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Better existing payment check
        const existingPayments = await Payment.findByAppointment(id);
        const hasCompletedPayment = existingPayments.some(p => p.status === 'completed');

        if (hasCompletedPayment) {
            return res.status(400).json({
                success: false,
                message: 'Payment has already been recorded for this appointment'
            });
        }

        // Use database transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            let paymentId;
            const pendingPayment = existingPayments.find(p => p.status === 'pending');

            if (pendingPayment) {
                // Update existing pending payment
                await Payment.update(pendingPayment.id, {
                    status: 'completed',
                    payment_method: payment_method,
                    external_reference: reference_number || transaction_id,
                    gcash_transaction_id: payment_method === 'gcash' ? transaction_id : null,
                    paid_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    notes: notes || `Payment manually confirmed via ${payment_method} by ${req.user.name}`
                });
                paymentId = pendingPayment.id;
            } else {
                // Create new payment record
                const paymentData = {
                    appointment_id: id,
                    user_id: appointment.owner_id,
                    amount: appointment.total_amount,
                    payment_method: payment_method,
                    status: 'completed',
                    external_reference: reference_number || transaction_id || `MANUAL-${Date.now()}`,
                    gcash_transaction_id: payment_method === 'gcash' ? transaction_id : null,
                    paid_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    notes: notes || `Payment manually confirmed via ${payment_method} by ${req.user.name}`
                };

                paymentId = await Payment.create(paymentData);
            }

            // Update appointment with both status AND method using raw query
            await connection.execute(
                'UPDATE appointments SET payment_status = ?, payment_method = ?, updated_at = NOW() WHERE id = ?',
                ['paid', payment_method, id]
            );

            await connection.commit();
            connection.release();

            console.log(`✅ Staff payment marked as paid via ${payment_method} for appointment ${id}`);

            const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

            res.status(200).json({
                success: true,
                message: `Payment marked as paid via ${payment_method}`,
                data: updatedAppointment,
                payment_id: paymentId,
                processed_by: req.user.name
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Staff error marking payment as paid:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating payment status',
            error: error.message
        });
    }
};

// Initiate GCash payment
exports.initiateGCashPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const appointment = await Appointment.findByIdWithPetDetails(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if already paid
        const hasPayment = await Payment.hasSuccessfulPayment(id);
        if (hasPayment) {
            return res.status(400).json({
                success: false,
                message: 'Payment has already been completed'
            });
        }

        // Create pending payment record
        const paymentData = {
            appointment_id: id,
            user_id: appointment.owner_id,
            amount: appointment.total_amount,
            payment_method: 'gcash',
            status: 'pending',
            external_reference: `GCASH-${Date.now()}`,
            notes: `GCash payment initiated by staff: ${req.user.name}`
        };

        const paymentId = await Payment.create(paymentData);

        res.status(200).json({
            success: true,
            message: 'GCash payment initiated',
            payment_id: paymentId,
            appointment_id: id,
            amount: appointment.total_amount,
            initiated_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error initiating GCash payment:', error);
        res.status(500).json({
            success: false,
            message: 'Error initiating GCash payment',
            error: error.message
        });
    }
};

// Helper function to convert 24-hour to 12-hour format
function convertTo12HourFormat(time24h) {
    if (!time24h || time24h.includes('AM') || time24h.includes('PM')) {
        return time24h;
    }

    try {
        const [hours, minutes] = time24h.split(':');
        const hourInt = parseInt(hours, 10);
        
        if (isNaN(hourInt) || hourInt < 0 || hourInt > 23) {
            return time24h;
        }

        const period = hourInt >= 12 ? 'PM' : 'AM';
        const hour12 = hourInt % 12 || 12;
        
        return `${hour12}:${minutes || '00'} ${period}`;
    } catch (error) {
        console.error('❌ Error converting time to 12-hour format:', error);
        return time24h;
    }
}

// Helper function for 12-hour to 24-hour conversion
function convertTo24Hour(time12h) {
    if (!time12h || (!time12h.includes('AM') && !time12h.includes('PM'))) {
        return time12h;
    }

    try {
        const [time, modifier] = time12h.split(' ');
        let [hours, minutes] = time.split(':');

        hours = parseInt(hours, 10);
        minutes = minutes || '00';

        if (isNaN(hours) || hours < 1 || hours > 12) {
            throw new Error('Invalid hour value');
        }

        if (modifier === 'AM' && hours === 12) {
            hours = 0;
        } else if (modifier === 'PM' && hours !== 12) {
            hours += 12;
        }

        return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
    } catch (error) {
        console.error('❌ Error converting time:', { time12h, error: error.message });
        return time12h;
    }
}

// Get all appointments with filtering
exports.getAllAppointments = async (req, res) => {
    try {
        const {
            status,
            date,
            groomer_id,
            customer_id,
            payment_status,
            service_id,
            search,
            page = 1,
            limit = 50,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;

        console.log('🔍 Staff fetching all appointments with filters:', req.query);

        const appointments = await Appointment.findAllForOwner({
            status,
            date,
            groomer_id,
            customer_id,
            payment_status,
            service_id,
            search,
            page: parseInt(page),
            limit: parseInt(limit),
            sortBy: sort_by,
            sortOrder: sort_order,
            includeAdditionalServices: true
        });

        res.status(200).json({
            success: true,
            data: appointments,
            count: appointments.length,
            filters: {
                status,
                date,
                groomer_id,
                customer_id,
                payment_status,
                service_id,
                search
            }
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointments',
            error: error.message
        });
    }
};

// Get appointment statistics
exports.getAppointmentStats = async (req, res) => {
    try {
        const stats = await Appointment.getStaffStats();

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointment stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointment statistics',
            error: error.message
        });
    }
};

// Get today's appointments
exports.getTodaysAppointments = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const appointments = await Appointment.findTodaysAppointments(today);

        res.status(200).json({
            success: true,
            date: today,
            data: appointments
        });
    } catch (error) {
        console.error('❌ Staff error fetching today\'s appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching today\'s appointments',
            error: error.message
        });
    }
};

// Get appointments by date range
exports.getAppointmentsByDateRange = async (req, res) => {
    try {
        const { start_date, end_date, status, groomer_id } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Both start_date and end_date are required'
            });
        }

        const appointments = await Appointment.findByDateRange(start_date, end_date, {
            status,
            groomer_id
        });

        res.status(200).json({
            success: true,
            data: appointments,
            dateRange: { start_date, end_date },
            filters: { status, groomer_id }
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointments by date range:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointments by date range',
            error: error.message
        });
    }
};

// Get appointments by status
exports.getAppointmentsByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        const validStatuses = ['pending', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}`
            });
        }

        const appointments = await Appointment.findByStatus(status);

        res.status(200).json({
            success: true,
            status,
            data: appointments
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointments by status:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointments by status',
            error: error.message
        });
    }
};

// Get appointments by groomer
exports.getAppointmentsByGroomer = async (req, res) => {
    try {
        const { groomerId } = req.params;
        const { date, status } = req.query;

        const appointments = await Appointment.findByGroomer(groomerId, { date, status });

        res.status(200).json({
            success: true,
            groomer_id: groomerId,
            filters: { date, status },
            data: appointments
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointments by groomer:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointments by groomer',
            error: error.message
        });
    }
};

// Get appointment details by ID
exports.getAppointmentDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findByIdWithPetDetails(id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Include active session info if any
        try {
            const [sessRows] = await db.execute(
                `SELECT * FROM appointment_sessions 
                 WHERE appointment_id = ? AND status = 'active'
                 ORDER BY start_time DESC LIMIT 1`,
                [id]
            );
            if (sessRows.length > 0) {
                appointment.active_session = sessRows[0];
            }
        } catch (e) {
            console.warn('Unable to load active session for appointment', id, e?.message);
        }

        res.status(200).json({
            success: true,
            data: appointment
        });
    } catch (error) {
        console.error('❌ Staff error fetching appointment details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointment details',
            error: error.message
        });
    }
};

// Assign groomer to appointment
exports.assignGroomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { groomer_id } = req.body;

        console.log('🔄 Staff assigning groomer:', { 
            appointment_id: id, 
            groomer_id,
            staff_id: req.user.id 
        });

        if (!groomer_id) {
            return res.status(400).json({
                success: false,
                message: 'Groomer ID is required'
            });
        }

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Validate groomer exists and is active
        const groomer = await User.findById(groomer_id);
        if (!groomer) {
            return res.status(404).json({
                success: false,
                message: 'Groomer not found'
            });
        }

        if (groomer.role !== 'staff' || groomer.staff_type !== 'Groomer') {
            return res.status(400).json({
                success: false,
                message: 'Selected user is not a groomer'
            });
        }

        if (groomer.status !== 'Active') {
            return res.status(400).json({
                success: false,
                message: 'Selected groomer is not currently active'
            });
        }

        // Check if appointment can have groomer assigned
        const validStatusesForAssignment = ['pending', 'confirmed', 'waiting', 'in_progress'];
        if (!validStatusesForAssignment.includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot assign groomer to ${appointment.status} appointment`
            });
        }

        // Perform the assignment
        const updated = await Appointment.update(id, { groomer_id });

        if (!updated) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update appointment with groomer assignment'
            });
        }

        // Get the updated appointment with full details
        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        console.log('✅ Staff groomer assigned successfully:', {
            appointment_id: id,
            groomer_id,
            groomer_name: groomer.name,
            assigned_by: req.user.name
        });

        // Add this logging here:
        await ActivityLogger.log(
            req.user,
            'ASSIGNED_GROOMER',
            'APPOINTMENT',
            `${updatedAppointment.pet?.name || 'Pet'} (${updatedAppointment.owner_name || 'Unknown Owner'})`,
            `Assigned groomer: ${groomer.name} | Appointment Status: ${appointment.status}`,
            req
        );

        res.status(200).json({
            success: true,
            message: `Groomer ${groomer.name} assigned successfully`,
            data: updatedAppointment,
            groomer: {
                id: groomer.id,
                name: groomer.name,
                email: groomer.email,
                phone: groomer.phone,
                profile_picture: groomer.profile_picture
            },
            assigned_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error assigning groomer:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning groomer',
            error: error.message
        });
    }
};

// Set actual schedule
exports.setActualSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { actual_date, actual_time } = req.body;

        if (!actual_date || !actual_time) {
            return res.status(400).json({
                success: false,
                message: 'Both actual date and time are required'
            });
        }

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        await Appointment.update(id, { actual_date, actual_time });

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: 'Actual schedule set successfully',
            data: updatedAppointment,
            updated_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error setting actual schedule:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting actual schedule',
            error: error.message
        });
    }
};

// Update appointment notes
exports.updateAppointmentNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        await Appointment.update(id, { special_notes: notes });

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: 'Appointment notes updated successfully',
            data: updatedAppointment,
            updated_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error updating appointment notes:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating appointment notes',
            error: error.message
        });
    }
};

// Mark as no-show
exports.markAsNoShow = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        const updateData = {
            status: 'no_show',
            special_notes: notes ? `No-show: ${notes}` : 'Customer did not show up'
        };

        await Appointment.update(id, updateData);

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: 'Appointment marked as no-show',
            data: updatedAppointment,
            updated_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error marking appointment as no-show:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking appointment as no-show',
            error: error.message
        });
    }
};

// Bulk status update
exports.bulkStatusUpdate = async (req, res) => {
    try {
        const { appointment_ids, status, notes } = req.body;

        if (!appointment_ids || !Array.isArray(appointment_ids) || appointment_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'appointment_ids array is required'
            });
        }

        const validStatuses = ['pending', 'confirmed', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Valid statuses are: ${validStatuses.join(', ')}`
            });
        }

        const results = [];

        for (const appointmentId of appointment_ids) {
            try {
                const updateData = { status };
                if (notes) updateData.special_notes = notes;

                await Appointment.update(appointmentId, updateData);
                results.push({ id: appointmentId, success: true });
            } catch (error) {
                results.push({ id: appointmentId, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;

        res.status(200).json({
            success: true,
            message: `${successCount} appointments updated successfully by ${req.user.name}`,
            results,
            updated_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error in bulk status update:', error);
        res.status(500).json({
            success: false,
            message: 'Error in bulk status update',
            error: error.message
        });
    }
};

// Cancel appointment
exports.cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, refund_payment = false } = req.body;

        console.log('🔴 Staff cancelling appointment (simple):', {
            id,
            reason,
            refund_payment,
            staff_id: req.user.id
        });

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        if (appointment.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Appointment is already cancelled'
            });
        }

        const updateData = {
            status: 'cancelled',
            special_notes: reason ? `Cancelled by staff: ${reason}` : `Cancelled by staff: ${req.user.name}`
        };

        // Handle payment refund logic
        if (refund_payment && appointment.payment_status === 'paid') {
            updateData.payment_status = 'refunded';
        }

        await Appointment.update(id, updateData);

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: 'Appointment cancelled successfully',
            data: updatedAppointment,
            cancelled_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error cancelling appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling appointment',
            error: error.message
        });
    }
};


exports.addServicesToAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { services, payment_method, preserve_payment_status, matted_coat_fee } = req.body;

        console.log('🔄 Staff adding services/fees to appointment:', {
            appointment_id: id,
            services_count: services?.length || 0,
            payment_method,
            preserve_payment_status,
            matted_coat_fee,
            staff_id: req.user.id
        });

        // Allow either services OR matted_coat_fee (not both required)
        const hasServices = services && Array.isArray(services) && services.length > 0;
        const hasMattedCoatFee = matted_coat_fee !== undefined && matted_coat_fee !== null && parseFloat(matted_coat_fee) > 0;

        if (!hasServices && !hasMattedCoatFee) {
            return res.status(400).json({
                success: false,
                message: 'Either services array or matted coat fee is required',
                error_type: 'validation_error'
            });
        }

        // Get the appointment
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Get pet information for price calculation (only if adding services)
        let pet = null;
        if (hasServices) {
            const pet_id = appointment.pet_id;
            const [petRows] = await db.execute('SELECT size FROM pets WHERE id = ?', [pet_id]);
            pet = petRows[0];

            if (!pet || !pet.size) {
                return res.status(404).json({
                    success: false,
                    message: 'Pet or pet size not found for this appointment'
                });
            }
        }

        // Process services if provided
        const servicesToAdd = [];
        const serviceValidationResults = [];

        if (hasServices) {
            for (const serviceRequest of services) {
                const { service_id, service_name } = serviceRequest;

                if (!service_id) {
                    serviceValidationResults.push({
                        service_name: service_name || 'Unknown',
                        success: false,
                        error: 'Service ID is required'
                    });
                    continue;
                }

                // Get service details
                const service = await GroomingService.findById(service_id);
                if (!service) {
                    serviceValidationResults.push({
                        service_name: service_name || `ID: ${service_id}`,
                        success: false,
                        error: 'Service not found'
                    });
                    continue;
                }

                // Check if this is the primary service
                if (appointment.service_id == service_id) {
                    serviceValidationResults.push({
                        service_name: service.name,
                        success: false,
                        error: `"${service.name}" is already the main service for this appointment`
                    });
                    continue;
                }

                // Check if service already exists in additional services
                const [existingServices] = await db.execute(
                    'SELECT id FROM appointment_services WHERE appointment_id = ? AND service_id = ?',
                    [id, service_id]
                );

                if (existingServices.length > 0) {
                    serviceValidationResults.push({
                        service_name: service.name,
                        success: false,
                        error: `"${service.name}" has already been added to this appointment`
                    });
                    continue;
                }

                // Calculate price
                const pet_size = pet.size.toLowerCase();
                const priceField = `price_${pet_size}`;
                const price = parseFloat(service[priceField] || service.price_medium || 0);

                if (price <= 0) {
                    serviceValidationResults.push({
                        service_name: service.name,
                        success: false,
                        error: `No valid price found for ${pet.size} pets`
                    });
                    continue;
                }

                // Service is valid, add to processing queue
                servicesToAdd.push({
                    service_id: service_id,
                    service: service,
                    price: price,
                    pet_size: pet_size
                });

                serviceValidationResults.push({
                    service_name: service.name,
                    success: true,
                    price: price
                });
            }

            // Check if we have any valid services to add (only if services were provided)
            if (hasServices && servicesToAdd.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid services to add',
                    error_type: 'validation_failed',
                    validation_results: serviceValidationResults
                });
            }
        }

        // Start database transaction for atomic operation
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            const addedServices = [];
            let totalAdditionalCost = 0;

            // Add services if provided
            if (hasServices && servicesToAdd.length > 0) {
                const pet_id = appointment.pet_id;

                for (const serviceData of servicesToAdd) {
                    const { service_id, service, price } = serviceData;

                    const [insertResult] = await connection.execute(
                        `INSERT INTO appointment_services 
                         (appointment_id, service_id, pet_id, price, payment_method, created_at) 
                         VALUES (?, ?, ?, ?, ?, NOW())`,
                        [id, service_id, pet_id, price, payment_method || 'cash']
                    );

                    addedServices.push({
                        appointment_service_id: insertResult.insertId,
                        service_id: service_id,
                        service_name: service.name,
                        price: price,
                        category: service.category,
                        description: service.description
                    });

                    totalAdditionalCost += price;

                    console.log('✅ Staff added service:', {
                        service_name: service.name,
                        price: price,
                        appointment_service_id: insertResult.insertId
                    });
                }
            }

            // Handle matted coat fee update
            let updateData = {};

            if (hasMattedCoatFee) {
                const mattedFeeAmount = parseFloat(matted_coat_fee);
                updateData.matted_coat_fee = mattedFeeAmount;
                totalAdditionalCost += mattedFeeAmount;
                console.log('✅ Staff adding matted coat fee:', mattedFeeAmount);
            }

            // Update the total amount in appointments table
            const currentTotal = parseFloat(appointment.total_amount || 0);
            const newTotal = currentTotal + totalAdditionalCost;
            updateData.total_amount = newTotal;
            updateData.updated_at = new Date();

            // Build dynamic update query
            const updateFields = Object.keys(updateData).map(field => `${field} = ?`).join(', ');
            const updateValues = Object.values(updateData);
            updateValues.push(id); // Add appointment ID for WHERE clause

            await connection.execute(
                `UPDATE appointments SET ${updateFields} WHERE id = ?`,
                updateValues
            );

            console.log('💰 Staff updated appointment:', {
                previous_total: currentTotal,
                added_amount: totalAdditionalCost,
                new_total: newTotal,
                services_added: addedServices.length,
                matted_coat_fee: hasMattedCoatFee ? parseFloat(matted_coat_fee) : 0
            });

            // Handle payment status
            if (!preserve_payment_status) {
                let newPaymentStatus = 'pending';

                const hasSuccessfulPayment = await Payment.hasSuccessfulPayment(id);

                if (hasSuccessfulPayment) {
                    newPaymentStatus = 'pending'; // Additional charges need payment
                    console.log('💳 Staff: Additional charges added - new payment required');
                } else if (appointment.payment_status === 'paid') {
                    newPaymentStatus = 'paid';
                    console.log('💳 Staff: Appointment already paid - maintaining paid status');
                } else {
                    newPaymentStatus = 'pending';
                    console.log('💳 Staff: New charges added - payment pending');
                }

                await connection.execute(
                    'UPDATE appointments SET payment_status = ? WHERE id = ?',
                    [newPaymentStatus, id]
                );
            }

            // Commit the transaction
            await connection.commit();
            connection.release();
            // Add this logging here:
            await ActivityLogger.log(
                req.user,
                'ADDED_SERVICE',
                'APPOINTMENT',
                `${appointment.pet?.name || 'Pet'} (${appointment.owner_name || 'Unknown Owner'})`,
                `Added service "${service.name}" | Price: PHP ${price} | New Total: PHP ${updateData.total_amount} | Matted Fee: PHP ${newMattedFee || 0}`,
                req
            );

            // Get the updated appointment with all details
            const updatedAppointment = await Appointment.findByIdWithAllDetails(id);

            // If the method doesn't exist, use fallback
            let finalAppointment = updatedAppointment;
            if (!updatedAppointment || !updatedAppointment.additional_services) {
                console.log('⚠️ Staff: Using fallback method to get complete appointment data');

                const baseAppointment = await Appointment.findByIdWithPetDetails(id);

                const [additionalServicesRows] = await db.execute(`
                    SELECT 
                        aps.id as appointment_service_id,
                        aps.service_id,
                        aps.price as service_price,
                        aps.payment_method,
                        aps.created_at,
                        gs.name as service_name,
                        gs.description,
                        gs.category,
                        gs.time_description,
                        gs.image_url
                    FROM appointment_services aps
                    JOIN grooming_services gs ON aps.service_id = gs.id
                    WHERE aps.appointment_id = ?
                    ORDER BY aps.created_at ASC
                `, [id]);

                const additional_services = additionalServicesRows.map(service => ({
                    id: service.service_id,
                    appointment_service_id: service.appointment_service_id,
                    name: service.service_name,
                    price: parseFloat(service.service_price),
                    payment_method: service.payment_method,
                    category: service.category,
                    description: service.description,
                    time_description: service.time_description,
                    image_url: service.image_url,
                    created_at: service.created_at
                }));

                baseAppointment.additional_services = additional_services;
                finalAppointment = baseAppointment;
            }

            // Create success message
            let responseMessage = '';
            if (hasServices && hasMattedCoatFee) {
                const serviceNames = addedServices.map(s => s.service_name);
                responseMessage = `${addedServices.length} service(s) and matted coat fee added: ${serviceNames.join(', ')} + Matted Coat Fee`;
            } else if (hasServices) {
                const serviceNames = addedServices.map(s => s.service_name);
                responseMessage = addedServices.length === 1
                    ? `"${serviceNames[0]}" added successfully`
                    : `${addedServices.length} services added successfully: ${serviceNames.join(', ')}`;
            } else if (hasMattedCoatFee) {
                responseMessage = `Matted coat fee (₱${parseFloat(matted_coat_fee).toFixed(2)}) added successfully`;
            }

            console.log('✅ Staff operation completed successfully:', {
                appointment_id: id,
                services_added: addedServices.length,
                matted_coat_fee_added: hasMattedCoatFee,
                total_additional_services: finalAppointment.additional_services?.length || 0,
                new_total: newTotal,
                updated_by: req.user.name
            });

            res.status(200).json({
                success: true,
                message: responseMessage,
                data: finalAppointment,
                addedServices: addedServices,
                mattedCoatFee: hasMattedCoatFee ? parseFloat(matted_coat_fee) : null,
                summary: {
                    previous_total: currentTotal,
                    additional_cost: totalAdditionalCost,
                    new_total: newTotal,
                    services_added_count: addedServices.length,
                    total_additional_services: finalAppointment.additional_services?.length || 0,
                    matted_coat_fee: hasMattedCoatFee ? parseFloat(matted_coat_fee) : 0
                },
                validation_results: serviceValidationResults,
                debug_info: {
                    appointment_id: finalAppointment.id,
                    additional_services_count: finalAppointment.additional_services?.length || 0,
                    has_additional_services: !!finalAppointment.additional_services,
                    is_array: Array.isArray(finalAppointment.additional_services),
                    source: updatedAppointment ? 'findByIdWithAllDetails' : 'fallback_method',
                    operation_type: hasServices && hasMattedCoatFee ? 'services_and_fee' :
                        hasServices ? 'services_only' : 'matted_fee_only'
                },
                updated_by: req.user.name
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Staff error adding services/fees to appointment:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'One or more services have already been added to this appointment',
                error_type: 'database_duplicate'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error adding services/fees to appointment',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Remove service from appointment
exports.removeServiceFromAppointment = async (req, res) => {
    try {
        const { id, serviceId } = req.params;

        console.log('🗑️ Staff removing service from appointment:', {
            appointment_id: id,
            service_id: serviceId,
            staff_id: req.user.id
        });

        // Get the appointment
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Check if service exists in additional services
        const [serviceRows] = await db.execute(`
            SELECT aps.id, aps.price, gs.name as service_name
            FROM appointment_services aps
            JOIN grooming_services gs ON aps.service_id = gs.id
            WHERE aps.appointment_id = ? AND aps.service_id = ?
        `, [id, serviceId]);

        if (serviceRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service not found in this appointment'
            });
        }

        const serviceToRemove = serviceRows[0];
        const servicePrice = parseFloat(serviceToRemove.price);

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Remove the service
            await connection.execute(
                'DELETE FROM appointment_services WHERE appointment_id = ? AND service_id = ?',
                [id, serviceId]
            );

            // Update total amount
            const currentTotal = parseFloat(appointment.total_amount);
            const newTotal = currentTotal - servicePrice;

            await connection.execute(
                'UPDATE appointments SET total_amount = ?, updated_at = NOW() WHERE id = ?',
                [newTotal, id]
            );

            await connection.commit();
            connection.release();

            console.log('✅ Staff service removed successfully:', {
                service_name: serviceToRemove.service_name,
                price_removed: servicePrice,
                new_total: newTotal,
                staff_id: req.user.id
            });

            // Get updated appointment
            const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

            res.status(200).json({
                success: true,
                message: `Service "${serviceToRemove.service_name}" removed successfully`,
                data: updatedAppointment,
                removedService: {
                    name: serviceToRemove.service_name,
                    price: servicePrice
                },
                summary: {
                    previous_total: currentTotal,
                    removed_amount: servicePrice,
                    new_total: newTotal
                },
                updated_by: req.user.name
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('❌ Staff error removing service from appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing service from appointment',
            error: error.message
        });
    }
};

// GCash payment webhook
exports.gcashPaymentWebhook = async (req, res) => {
    try {
        const {
            reference_number,
            transaction_id,
            status,
            amount
        } = req.body;

        console.log('📨 Staff GCash webhook received:', req.body);

        // Find payment by reference number
        const payment = await Payment.findByReference(reference_number);
        if (!payment) {
            console.log('⚠️ Staff: Payment not found for reference:', reference_number);
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        let paymentStatus = 'pending';
        let appointmentPaymentStatus = 'pending';

        // Map GCash status to your system status
        switch (status?.toLowerCase()) {
            case 'success':
            case 'completed':
            case 'paid':
                paymentStatus = 'completed';
                appointmentPaymentStatus = 'paid';
                break;
            case 'failed':
            case 'error':
                paymentStatus = 'failed';
                appointmentPaymentStatus = 'failed';
                break;
            case 'cancelled':
            case 'canceled':
                paymentStatus = 'cancelled';
                appointmentPaymentStatus = 'cancelled';
                break;
            default:
                paymentStatus = 'pending';
                appointmentPaymentStatus = 'pending';
        }

        // Update payment record
        const updateData = {
            status: paymentStatus,
            gcash_transaction_id: transaction_id,
            notes: `GCash webhook: ${status}`
        };

        if (paymentStatus === 'completed') {
            updateData.paid_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        }

        await Payment.update(payment.id, updateData);

        // Update appointment payment status
        await Appointment.update(payment.appointment_id, {
            payment_status: appointmentPaymentStatus,
            payment_method: 'gcash'
        });

        console.log(`✅ Staff: Payment ${payment.id} updated to ${paymentStatus}`);

        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully'
        });
    } catch (error) {
        console.error('❌ Staff error processing GCash webhook:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing webhook',
            error: error.message
        });
    }
};

// Refund payment
exports.refundPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { refund_amount, reason, refund_method = 'original' } = req.body;

        console.log('💸 Staff processing refund:', {
            appointment_id: id,
            refund_amount,
            reason,
            refund_method,
            staff_id: req.user.id
        });

        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        if (appointment.payment_status !== 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Cannot refund unpaid appointment'
            });
        }

        const refundAmount = refund_amount || appointment.total_amount;

        // Update appointment
        await Appointment.update(id, {
            payment_status: 'refunded'
        });

        // Create refund record
        const refundData = {
            appointment_id: id,
            amount: parseFloat(refundAmount),
            payment_method: refund_method,
            status: 'completed',
            refunded_at: new Date(),
            reason: reason || 'Appointment cancelled',
            notes: `Refund processed by ${req.user.name}: ₱${refundAmount}`
        };

        await Payment.createRefund(refundData);

        const updatedAppointment = await Appointment.findByIdWithPetDetails(id);

        res.status(200).json({
            success: true,
            message: `Refund of ₱${refundAmount} processed successfully`,
            data: updatedAppointment,
            refund_details: {
                amount: refundAmount,
                method: refund_method,
                reason: reason
            },
            processed_by: req.user.name
        });
    } catch (error) {
        console.error('❌ Staff error processing refund:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing refund',
            error: error.message
        });
    }
};
// ... existing code ...

// Get available time slots
exports.getAvailableTimeSlots = async (req, res) => {
    try {
        const { date } = req.params;
        const { exclude_appointment } = req.query;

        console.log('🕐 Staff checking time slots for date:', date);

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }

        // Get booked time slots for the date
        let query = `
            SELECT DISTINCT preferred_time 
            FROM appointments 
            WHERE preferred_date = ? 
            AND status NOT IN ('cancelled', 'completed', 'no_show')
        `;
        
        const params = [date];

        // Exclude specific appointment if provided (for rescheduling)
        if (exclude_appointment) {
            query += ' AND id != ?';
            params.push(exclude_appointment);
        }

        query += ' ORDER BY preferred_time';

        const [bookedRows] = await db.execute(query, params);

        // Base time slots in 12-hour format
        const allTimeSlots12h = [
            '9:00 AM', '10:00 AM', '11:00 AM', 
            '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'
        ];

        // Convert database times to 12-hour format
        const bookedTimeSlots12h = bookedRows.map(row => {
            const dbTime = row.preferred_time;
            return convertTo12HourFormat(dbTime);
        });

        // Calculate available slots
        const availableTimeSlots12h = allTimeSlots12h.filter(slot => 
            !bookedTimeSlots12h.includes(slot)
        );

        res.status(200).json({
            success: true,
            data: {
                date,
                allTimeSlots: allTimeSlots12h,
                bookedTimeSlots: bookedTimeSlots12h,
                availableTimeSlots: availableTimeSlots12h
            }
        });

    } catch (error) {
        console.error('❌ Staff error fetching time slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching time slots',
            error: error.message
        });
    }
};

// Upload before/after images for completed appointment
exports.uploadAppointmentImages = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        console.log('📸 Staff uploading appointment images:', {
            appointment_id: id,
            staff_id: req.user.id
        });

        if (!req.files?.beforeImage || !req.files?.afterImage) {
            return res.status(400).json({
                success: false,
                message: 'Both before and after images are required'
            });
        }

        const beforeImagePath = req.files.beforeImage[0].path;
        const afterImagePath = req.files.afterImage[0].path;

        const [result] = await db.execute(
            `UPDATE appointments 
             SET before_image = ?, after_image = ?, upload_notes = ?, has_images = TRUE, updated_at = NOW()
             WHERE id = ?`,
            [beforeImagePath, afterImagePath, notes || null, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Images uploaded successfully',
            data: {
                beforeImage: beforeImagePath,
                afterImage: afterImagePath,
                notes: notes
            },
            uploaded_by: req.user.name
        });

    } catch (error) {
        console.error('❌ Staff error uploading images:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading images',
            error: error.message
        });
    }
};

// Serve appointment images
exports.serveAppointmentImage = async (req, res) => {
    try {
        const { filename } = req.params;
        const uploadsPath = path.join(process.cwd(), 'uploads', 'appointments');
        const imagePath = path.join(uploadsPath, filename);
        
        if (!fs.existsSync(imagePath)) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }

        const ext = path.extname(filename).toLowerCase();
        const contentTypeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };

        res.setHeader('Content-Type', contentTypeMap[ext] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        res.sendFile(path.resolve(imagePath));
    } catch (error) {
        console.error('❌ Staff error serving image:', error);
        res.status(500).json({
            success: false,
            message: 'Error serving image'
        });
    }
};

// Get appointment service summary
exports.getAppointmentServices = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🔍 Staff fetching service summary for appointment:', id);

        const serviceSummary = await Appointment.getServiceSummary(id);
        
        if (!serviceSummary) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        res.status(200).json({
            success: true,
            data: serviceSummary
        });
    } catch (error) {
        console.error('❌ Staff error getting service summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting service summary',
            error: error.message
        });
    }
};

// Get appointment ratings
exports.getAppointmentRatings = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('⭐ Staff fetching ratings for appointment:', id);
        
        // First, verify the appointment exists and is accessible by staff
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        const [rows] = await db.execute(`
            SELECT 
                r.*,
                u.name as customer_name
            FROM ratings r
            JOIN appointments a ON r.appointment_id = a.id
            LEFT JOIN users u ON a.owner_id = u.id
            WHERE r.appointment_id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No rating found for this appointment'
            });
        }

        res.status(200).json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('❌ Staff error fetching rating:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching rating',
            error: error.message
        });
    }
};