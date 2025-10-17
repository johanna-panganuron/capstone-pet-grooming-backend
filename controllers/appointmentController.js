// controllers/appointmentController.js (pet_owner)
const Appointment = require('../models/Appointment');
const GroomingService = require('../models/GroomingService');
const Payment = require('../models/Payment'); 
const ownerNotificationHelper = require('../utils/ownerNotificationHelper');
const db = require('../models/db');

// Helper function to get all active staff members
async function getActiveStaffMembers() {
    try {
        const [staffRows] = await db.execute(`
            SELECT id FROM users 
            WHERE role = 'staff' 
            AND status = 'active'
        `);
        return staffRows.map(row => row.id);
    } catch (error) {
        console.error('Error fetching active staff:', error);
        return [];
    }
}
// CREATE APPOINTMENT
exports.createAppointment = async (req, res) => {
    try {
        console.log('Creating new appointment with multiple services:', {
            pet_id: req.body.pet_id,
            primary_service_id: req.body.service_id,
            additional_services: req.body.additional_services,
            preferred_date: req.body.preferred_date,
            preferred_time: req.body.preferred_time,
            user_id: req.user.id
        });

        // 1. Validate required fields
        const requiredFields = [
            'pet_id', 'service_id', 'preferred_date', 'preferred_time'
        ];

        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required`
                });
            }
        }

        // 2. Parse and validate additional services
        let additionalServices = [];
        if (req.body.additional_services && Array.isArray(req.body.additional_services)) {
            additionalServices = req.body.additional_services.filter(service => 
                service.service_id && service.price !== undefined
            );
        }

        console.log('Additional services to add:', additionalServices.length);

        // 3. Validate primary service
        const primaryService = await GroomingService.findById(req.body.service_id);
        if (!primaryService) {
            return res.status(404).json({
                success: false,
                message: 'Primary service not found'
            });
        }

        if (primaryService.status !== 'available') {
            return res.status(400).json({
                success: false,
                message: 'Primary service is currently unavailable'
            });
        }

        // 4. Validate all additional services exist and are available
        const additionalServiceIds = additionalServices.map(s => s.service_id);
        if (additionalServiceIds.length > 0) {
            const [serviceRows] = await db.execute(
                `SELECT id, name, status FROM grooming_services WHERE id IN (${additionalServiceIds.map(() => '?').join(',')})`,
                additionalServiceIds
            );

            const unavailableServices = serviceRows.filter(s => s.status !== 'available');
            if (unavailableServices.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Some additional services are unavailable: ${unavailableServices.map(s => s.name).join(', ')}`
                });
            }

            if (serviceRows.length !== additionalServiceIds.length) {
                return res.status(404).json({
                    success: false,
                    message: 'Some additional services were not found'
                });
            }
        }

        // 5. Validate preferred date
        const preferredDate = new Date(req.body.preferred_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (preferredDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Preferred date cannot be in the past'
            });
        }

        // 6. Enhanced active appointment check
        console.log('Performing enhanced active appointment check...');
        
        const activeAppointment = await Appointment.checkPetActiveAppointments(
            req.body.pet_id,
            req.user.id
        );

        if (activeAppointment) {
            console.log('BLOCKING: Active appointment found for pet');
            return res.status(409).json({
                success: false,
                message: 'ACTIVE_APPOINTMENT_EXISTS',
                error: `Your pet "${activeAppointment.pet_name || 'Unknown'}" already has an active appointment scheduled for ${new Date(activeAppointment.preferred_date).toLocaleDateString()} at ${activeAppointment.preferred_time}. Only one active appointment per pet is allowed.`,
                data: {
                    existing_appointment: {
                        id: activeAppointment.id,
                        pet_id: activeAppointment.pet_id,
                        pet_name: activeAppointment.pet_name,
                        service_name: activeAppointment.service_name,
                        preferred_date: activeAppointment.preferred_date,
                        preferred_time: activeAppointment.preferred_time,
                        status: activeAppointment.status
                    }
                }
            });
        }

        // 7. Calculate pricing for primary service
        const petSize = req.body.pet_size ? req.body.pet_size.toLowerCase() : 'medium';
        console.log('Pet size for pricing:', petSize);
        
        let basePrice;
        switch (petSize) {
            case 'xs': basePrice = primaryService.price_xs; break;
            case 'small': basePrice = primaryService.price_small; break;
            case 'medium': basePrice = primaryService.price_medium; break;
            case 'large': basePrice = primaryService.price_large; break;
            case 'xl': basePrice = primaryService.price_xl; break;
            case 'xxl': basePrice = primaryService.price_xxl; break;
            default: basePrice = primaryService.price_medium;
        }

        if (!basePrice || basePrice <= 0) {
            basePrice = primaryService.price_medium || 0;
        }

        // 8. Calculate total amount including additional services
        const mattedCoatFee = parseFloat(req.body.matted_coat_fee) || 0;
        const additionalServicesTotal = additionalServices.reduce((sum, service) => 
            sum + parseFloat(service.price), 0
        );
        
        const totalAmount = parseFloat(basePrice) + mattedCoatFee + additionalServicesTotal;

        console.log('Price calculation:', {
            basePrice,
            mattedCoatFee,
            additionalServicesTotal,
            totalAmount,
            additionalServicesCount: additionalServices.length
        });

        // 9. Start database transaction
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();

            // 10. Create primary appointment
            const appointmentData = {
                pet_id: req.body.pet_id,
                owner_id: req.user.id,
                service_id: req.body.service_id,
                preferred_date: req.body.preferred_date,
                preferred_time: req.body.preferred_time,
                base_price: basePrice,
                matted_coat_fee: mattedCoatFee,
                total_amount: totalAmount,
                special_notes: req.body.special_notes || null,
                status: 'pending'
            };

            console.log('Creating primary appointment...');
            const appointmentId = await Appointment.create(appointmentData);
            
            if (!appointmentId) {
                throw new Error('Failed to create appointment - no ID returned');
            }

            console.log('Primary appointment created with ID:', appointmentId);

            // 11. Add additional services if any
            if (additionalServices.length > 0) {
                console.log('💾 Adding additional services...');
                
                for (const additionalService of additionalServices) {
                    await connection.execute(
                        `INSERT INTO appointment_services 
                         (appointment_id, service_id, pet_id, price, payment_method, status, created_at) 
                         VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
                        [
                            appointmentId,
                            additionalService.service_id,
                            req.body.pet_id,
                            parseFloat(additionalService.price),
                            additionalService.payment_method || 'cash'
                        ]
                    );
                }
                
                console.log(`Added ${additionalServices.length} additional services`);
            }

            // 12. Commit transaction
            await connection.commit();
            connection.release();

            // 13. Get the complete appointment data with services
            const completeAppointment = await Appointment.findByIdWithPetDetails(appointmentId);

            console.log('Multi-service appointment created successfully:', {
                appointmentId,
                primaryService: primaryService.name,
                additionalServicesCount: additionalServices.length,
                totalAmount
            });
// 14. Send notification to owner about new appointment
// 14. Send notifications to owner AND staff about new appointment
try {
    const [petDetails] = await db.execute(`
        SELECT p.name as pet_name, u.name as customer_name 
        FROM pets p 
        JOIN users u ON u.id = p.user_id 
        WHERE p.id = ?
    `, [req.body.pet_id]);

    if (petDetails.length > 0) {
        const pet = petDetails[0];
        
        // Get shop owner
        const [ownerRows] = await db.execute(`
            SELECT id FROM users WHERE role = 'owner' LIMIT 1
        `);

        // Get all active staff
        const staffIds = await getActiveStaffMembers();
        
        const notificationData = {
            customerName: pet.customer_name,
            petName: pet.pet_name,
            date: new Date(req.body.preferred_date).toLocaleDateString(),
            time: req.body.preferred_time
        };

        // Send to owner
        if (ownerRows.length > 0) {
            await ownerNotificationHelper.sendNewAppointmentNotification(
                ownerRows[0].id, 
                notificationData
            );
            console.log('Owner notification sent');
        }

        // Send to all active staff
        for (const staffId of staffIds) {
            await ownerNotificationHelper.sendNewAppointmentNotification(
                staffId, 
                notificationData
            );
        }
        console.log(`Notifications sent to ${staffIds.length} staff members`);
    }
} catch (notificationError) {
    console.error('Error sending notifications:', notificationError);
}
            // 15. Return success response
            res.status(201).json({
                success: true,
                message: `Appointment created successfully with ${additionalServices.length + 1} service(s). We will contact you to confirm the appointment.`,
                appointmentId,
                data: {
                    ...completeAppointment,
                    service_summary: {
                        primary_service: {
                            id: primaryService.id,
                            name: primaryService.name,
                            price: basePrice
                        },
                        additional_services: additionalServices,
                        total_services: additionalServices.length + 1,
                        services_total: totalAmount
                    }
                }
            });

        } catch (transactionError) {
            await connection.rollback();
            connection.release();
            throw transactionError;
        }

    } catch (error) {
        console.error('Error creating multi-service appointment:', error);
        
        // Handle specific database errors
        if (error.message.includes('FOREIGN KEY constraint')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pet or service ID provided',
                error: 'The specified pet or service does not exist'
            });
        }

        if (error.message.includes('UNIQUE constraint')) {
            return res.status(409).json({
                success: false,
                message: 'DUPLICATE_CONSTRAINT_ERROR',
                error: 'An appointment with these exact details already exists'
            });
        }

        if (error.message.includes('uk_active_booking_slot')) {
            return res.status(409).json({
                success: false,
                message: 'TIME_SLOT_UNAVAILABLE',
                error: 'This time slot is no longer available'
            });
        }

        // Generic error response
        res.status(500).json({
            success: false,
            message: 'Error creating appointment',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};
//  rescheduleAppointment
exports.rescheduleAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { preferred_date, preferred_time, service_id, matted_coat_fee, reason } = req.body;

        console.log(`Rescheduling appointment ${appointmentId}`, {
            new_date: preferred_date,
            new_time: preferred_time,
            reason: reason || 'No reason provided',
            user_id: req.user.id,
            user_role: req.user.role
        });

        if (!preferred_date || !preferred_time) {
            return res.status(400).json({
                success: false,
                message: 'New date and time are required for rescheduling'
            });
        }

        // Get existing appointment
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Verify ownership
        if (appointment.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only reschedule your own appointments.'
            });
        }

        // Check if appointment can be rescheduled
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: 'This appointment cannot be rescheduled. Please contact us for assistance.'
            });
        }

        // Validate new date is in the future
        const newDate = new Date(preferred_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (newDate < today) {
            return res.status(400).json({
                success: false,
                message: 'New date cannot be in the past'
            });
        }

        // Check for conflicts with the new date/time (excluding current appointment)
        const [conflictRows] = await db.execute(`
            SELECT id FROM appointments 
            WHERE preferred_date = ? 
            AND preferred_time = ? 
            AND status NOT IN ('cancelled', 'completed') 
            AND id != ?
        `, [preferred_date, Appointment.convertTo24Hour(preferred_time), appointmentId]);

        if (conflictRows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Another appointment already exists for this date and time'
            });
        }

        // Ensure user_id is captured correctly
        console.log('📝 Saving reschedule history with user ID...');
        console.log('🔍 DEBUG req.user before saving:', {
            id: req.user.id,
            role: req.user.role,
            name: req.user.name
        });
        
        // VALIDATE USER ID EXISTS
        if (!req.user.id) {
            console.error('❌ CRITICAL: req.user.id is missing!');
            return res.status(500).json({
                success: false,
                message: 'Authentication error: User ID not found'
            });
        }
        
        try {
            // Save reschedule history BEFORE updating appointment
            await db.execute(`
                INSERT INTO appointment_reschedule_history 
                (appointment_id, old_preferred_date, old_preferred_time, 
                 new_preferred_date, new_preferred_time, reason, 
                 rescheduled_by_user_id, rescheduled_by_role, rescheduled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                appointmentId,
                appointment.preferred_date,
                Appointment.convertTo24Hour(appointment.preferred_time),
                preferred_date,
                Appointment.convertTo24Hour(preferred_time),
                reason || 'Rescheduled by customer',
                req.user.id, 
                req.user.role || 'pet_owner' 
            ]);
            
            console.log('Reschedule history saved successfully with user_id:', req.user.id);
        } catch (historyError) {
            console.error('Error saving reschedule history:', historyError);
            console.error('Failed parameters:', {
                appointmentId,
                old_date: appointment.preferred_date,
                old_time: Appointment.convertTo24Hour(appointment.preferred_time),
                new_date: preferred_date,
                new_time: Appointment.convertTo24Hour(preferred_time),
                reason: reason || 'Rescheduled by customer',
                user_id: req.user.id,
                user_role: req.user.role || 'pet_owner'
            });
        
            return res.status(500).json({
                success: false,
                message: 'Failed to save reschedule history'
            });
        }

        // Prepare update data
        const updateData = {
            preferred_date,
            preferred_time: Appointment.convertTo24Hour(preferred_time)
        };

        // If service is being changed, recalculate pricing
        if (service_id && service_id !== appointment.service_id) {
            const newService = await GroomingService.findById(service_id);
            if (!newService) {
                return res.status(404).json({
                    success: false,
                    message: 'New service not found'
                });
            }

            // Get pet details for pricing
            const [petRows] = await db.execute('SELECT size FROM pets WHERE id = ?', [appointment.pet_id]);
            const petSize = petRows[0]?.size?.toLowerCase() || 'medium';
            
            let newBasePrice;
            switch (petSize) {
                case 'xs': newBasePrice = newService.price_xs; break;
                case 'small': newBasePrice = newService.price_small; break;
                case 'medium': newBasePrice = newService.price_medium; break;
                case 'large': newBasePrice = newService.price_large; break;
                case 'xl': newBasePrice = newService.price_xl; break;
                case 'xxl': newBasePrice = newService.price_xxl; break;
                default: newBasePrice = newService.price_medium;
            }

            updateData.service_id = service_id;
            updateData.base_price = newBasePrice;
            updateData.total_amount = parseFloat(newBasePrice) + parseFloat(matted_coat_fee || appointment.matted_coat_fee || 0);
        }

        // Update matted coat fee if provided
        if (matted_coat_fee !== undefined) {
            updateData.matted_coat_fee = matted_coat_fee;
            updateData.total_amount = parseFloat(updateData.base_price || appointment.base_price) + parseFloat(matted_coat_fee);
        }

        // Update the appointment
        const updateResult = await Appointment.update(appointmentId, updateData);
        
        if (!updateResult) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update appointment'
            });
        }

        // Return updated appointment data
        const updatedAppointment = await Appointment.findByIdWithPetDetails(appointmentId);

        console.log(`Appointment ${appointmentId} rescheduled successfully`, {
            old_schedule: `${appointment.preferred_date} ${appointment.preferred_time}`,
            new_schedule: `${preferred_date} ${preferred_time}`,
            rescheduled_by_user_id: req.user.id,
            rescheduled_by_role: req.user.role,
            reschedule_history_count: updatedAppointment.reschedule_history?.length || 0
        });
// Send notification to owner about reschedule
// Send notifications to owner AND staff about reschedule
try {
    const [appointmentDetails] = await db.execute(`
        SELECT p.name as pet_name, u.name as customer_name 
        FROM appointments a
        JOIN pets p ON p.id = a.pet_id
        JOIN users u ON u.id = a.owner_id 
        WHERE a.id = ?
    `, [appointmentId]);

    if (appointmentDetails.length > 0) {
        const details = appointmentDetails[0];
        
        const [ownerRows] = await db.execute(`
            SELECT id FROM users WHERE role = 'owner' LIMIT 1
        `);

        const staffIds = await getActiveStaffMembers();
        
        const notificationData = {
            customerName: details.customer_name,
            petName: details.pet_name,
            oldDate: new Date(appointment.preferred_date).toLocaleDateString(),
            oldTime: appointment.preferred_time,
            newDate: new Date(preferred_date).toLocaleDateString(),
            newTime: preferred_time,
            reason: reason || 'Customer requested reschedule'
        };

        // Send to owner
        if (ownerRows.length > 0) {
            await ownerNotificationHelper.sendAppointmentRescheduleNotification(
                ownerRows[0].id, 
                notificationData
            );
            console.log('Owner notification sent');
        }

        // Send to all active staff
        for (const staffId of staffIds) {
            await ownerNotificationHelper.sendAppointmentRescheduleNotification(
                staffId, 
                notificationData
            );
        }
        console.log(`Reschedule notifications sent to ${staffIds.length} staff members`);
    }
} catch (notificationError) {
    console.error('Error sending reschedule notifications:', notificationError);
}
        res.status(200).json({
            success: true,
            message: 'Appointment rescheduled successfully',
            data: updatedAppointment
        });

    } catch (error) {
        console.error('Error rescheduling appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error rescheduling appointment',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// UPDATE APPOINTMENT (limited fields for pet owners)
exports.updateAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const { preferred_date, preferred_time, service_id, matted_coat_fee, special_notes, reason } = req.body;

        console.log(`Updating appointment ${appointmentId}`, {
            updates: req.body,
            user_id: req.user.id,
            user_role: req.user.role
        });

        // 1. Get current appointment
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // 2. Verify ownership
        if (appointment.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only update your own appointments.'
            });
        }

        // 3. Validate appointment status
        if (!['pending', 'confirmed'].includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: 'This appointment cannot be updated. Please contact us for assistance.'
            });
        }

        // 4. Prepare update data
        const updateData = {};
        let isReschedule = false;

        // Check if date or time is being changed (reschedule)
        if (preferred_date && preferred_date !== appointment.preferred_date) {
            const dateObj = new Date(preferred_date);
            if (isNaN(dateObj.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format'
                });
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (dateObj < today) {
                return res.status(400).json({
                    success: false,
                    message: 'New date cannot be in the past'
                });
            }

            updateData.preferred_date = dateObj.toISOString().split('T')[0];
            isReschedule = true;
        }

        if (preferred_time) {
            const formattedTime = Appointment.convertTo24Hour(preferred_time);
            if (formattedTime !== appointment.preferred_time) {
                updateData.preferred_time = formattedTime;
                isReschedule = true;
            }
        }

        // If it's a reschedule, save history FIRST with proper user_id
        if (isReschedule) {
            console.log('This is a reschedule - saving history with user info...');
            
            // VALIDATE USER ID EXISTS
            if (!req.user.id) {
                console.error('CRITICAL: req.user.id is missing for reschedule!');
                return res.status(500).json({
                    success: false,
                    message: 'Authentication error: User ID not found'
                });
            }

            // Verify time slot availability if time is being changed
            const dateToCheck = updateData.preferred_date || appointment.preferred_date;
            const timeToCheck = updateData.preferred_time || appointment.preferred_time;
            
            try {
                const bookedSlots = await Appointment.getBookedTimeSlots(dateToCheck);
                
                if (bookedSlots.includes(timeToCheck)) {
                    return res.status(409).json({
                        success: false,
                        message: 'The selected time slot is no longer available',
                        code: 'TIME_SLOT_UNAVAILABLE',
                        availableSlots: await Appointment.getAvailableTimeSlots(dateToCheck)
                    });
                }
            } catch (error) {
                console.error('Error checking time slots:', error);
                return res.status(400).json({
                    success: false,
                    message: 'Error verifying time slot availability'
                });
            }

            try {
                // SAVE RESCHEDULE HISTORY with proper user_id
                await db.execute(`
                    INSERT INTO appointment_reschedule_history 
                    (appointment_id, old_preferred_date, old_preferred_time, 
                     new_preferred_date, new_preferred_time, reason, 
                     rescheduled_by_user_id, rescheduled_by_role, rescheduled_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
                `, [
                    appointmentId,
                    appointment.preferred_date,
                    appointment.preferred_time,
                    updateData.preferred_date || appointment.preferred_date,
                    updateData.preferred_time || appointment.preferred_time,
                    reason || 'Updated by customer',
                    req.user.id, 
                    req.user.role || 'pet_owner'
                ]);
                
                console.log('Reschedule history saved with user_id:', req.user.id);
            } catch (historyError) {
                console.error('Error saving reschedule history:', historyError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to save reschedule history'
                });
            }
        }

        // Handle other non-reschedule updates
        if (special_notes !== undefined && special_notes !== appointment.special_notes) {
            updateData.special_notes = special_notes;
        }

        if (matted_coat_fee !== undefined) {
            const newFee = parseFloat(matted_coat_fee);
            const currentFee = parseFloat(appointment.matted_coat_fee || 0);
            
            if (newFee !== currentFee) {
                updateData.matted_coat_fee = newFee;
                // Recalculate total amount
                updateData.total_amount = parseFloat(appointment.base_price) + newFee;
            }
        }

        // If service is being changed, recalculate pricing
        if (service_id && service_id !== appointment.service_id) {
            const newService = await GroomingService.findById(service_id);
            if (!newService) {
                return res.status(404).json({
                    success: false,
                    message: 'New service not found'
                });
            }

            // Get pet details for pricing
            const [petRows] = await db.execute('SELECT size FROM pets WHERE id = ?', [appointment.pet_id]);
            const petSize = petRows[0]?.size?.toLowerCase() || 'medium';
            
            let newBasePrice;
            switch (petSize) {
                case 'xs': newBasePrice = newService.price_xs; break;
                case 'small': newBasePrice = newService.price_small; break;
                case 'medium': newBasePrice = newService.price_medium; break;
                case 'large': newBasePrice = newService.price_large; break;
                case 'xl': newBasePrice = newService.price_xl; break;
                case 'xxl': newBasePrice = newService.price_xxl; break;
                default: newBasePrice = newService.price_medium;
            }

            updateData.service_id = service_id;
            updateData.base_price = newBasePrice;
            updateData.total_amount = parseFloat(newBasePrice) + parseFloat(updateData.matted_coat_fee || appointment.matted_coat_fee || 0);
        }

        // Check if there are any changes to apply
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No changes detected'
            });
        }

        // Update the appointment
        const updateResult = await Appointment.update(appointmentId, updateData);
        
        if (!updateResult) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update appointment'
            });
        }

        // Return updated appointment data
        const updatedAppointment = await Appointment.findByIdWithPetDetails(appointmentId);

        console.log(`Appointment ${appointmentId} updated successfully by user ${req.user.id}`);

        res.status(200).json({
            success: true,
            message: isReschedule ? 'Appointment rescheduled successfully' : 'Appointment updated successfully',
            data: updatedAppointment
        });

    } catch (error) {
        console.error('Error updating appointment:', error);
        
        if (error.message.includes('TIME_SLOT_UNAVAILABLE')) {
            return res.status(409).json({
                success: false,
                message: 'The selected time slot was just booked by someone else',
                code: 'TIME_SLOT_UNAVAILABLE'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error updating appointment',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// GET BOOKED SLOTS FOR SPECIFIC DATE - NEW METHOD
exports.getBookedSlots = async (req, res) => {
    try {
      console.log('Getting booked slots for date:', req.query.date);
      
      if (!req.query.date) {
        return res.status(400).json({
          success: false,
          message: 'Date parameter is required'
        });
      }
  
      // Get booked slots and ensure they're in 12-hour format
      const bookedSlots = await Appointment.getBookedTimeSlots(req.query.date);
      
      // Debug log to see what format we're returning
      console.log('Booked slots (should be 12-hour format):', bookedSlots);
      
      res.json({
        success: true,
        date: req.query.date,
        bookedSlots: bookedSlots,
        count: bookedSlots.length
      });
      
    } catch (error) {
      console.error('❌ Error fetching booked slots:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch booked slots',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

// GET AVAILABLE TIME SLOTS
exports.getAvailableTimeSlots = async (req, res) => {
    try {
        const { date, service_id } = req.query;

        console.log('🔍 Time slots request:', { date, service_id, timestamp: new Date().toISOString() });

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }

        // Validate date format and ensure it's not in the past
        const requestedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (isNaN(requestedDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format'
            });
        }

        if (requestedDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot check availability for past dates'
            });
        }

        // Get comprehensive time slot data
        const timeSlotData = await Appointment.getAvailableTimeSlots(date, service_id);
        

        // CRITICAL: Add cache-busting headers
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.status(200).json({
            success: true,
            date: date,
            timestamp: new Date().toISOString(),
            // Primary data for frontend
            availableTimeSlots: timeSlotData.availableTimeSlots,
            bookedTimeSlots: timeSlotData.bookedTimeSlots,
            
            // Additional context
            allTimeSlots: timeSlotData.allTimeSlots,
            summary: {
                total_slots: timeSlotData.allTimeSlots.length,
                available_count: timeSlotData.availableTimeSlots.length,
                booked_count: timeSlotData.bookedTimeSlots.length
            }
        });

    } catch (error) {
        console.error('Error fetching time slots:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available time slots',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// GET ALL APPOINTMENTS FOR LOGGED-IN PET OWNER
exports.getMyAppointments = async (req, res) => {
    try {
        console.log('Pet Owner fetching appointments. User ID:', req.user.id);
        console.log('User role:', req.user.role);

        const appointments = await Appointment.findByOwnerWithPetDetails(req.user.id);
        
        console.log('Found appointments:', appointments.length);
        
        // Sync payment status for all appointments (parallel processing)
        if (appointments.length > 0) {
            console.log('Syncing payment status for all appointments...');
            
            const syncPromises = appointments.map(appointment => 
                Appointment.syncPaymentStatusWithPayments(appointment.id).catch(error => {
                    console.error(`Failed to sync payment for appointment ${appointment.id}:`, error);
                    return null;
                })
            );
            
            await Promise.all(syncPromises);
            
            // Fetch appointments again with updated payment statuses AND additional services
            const updatedAppointments = await Appointment.findByOwnerWithPetDetails(req.user.id);
            
            console.log('Payment status sync complete. Sample appointment check:');
            if (updatedAppointments.length > 0) {
                const sample = updatedAppointments[0];
                console.log(`Sample appointment ${sample.id}:`, {
                    has_groomer: !!sample.groomer_name,
                    groomer_name: sample.groomer_name,
                    additional_services_count: sample.additional_services?.length || 0,
                    total_amount: sample.total_amount,
                    payment_status: sample.payment_status
                });
            }
            
            res.status(200).json({
                success: true,
                data: updatedAppointments,
                sync_completed: true,
                summary: {
                    total_appointments: updatedAppointments.length,
                    with_groomer: updatedAppointments.filter(a => a.groomer_name).length,
                    with_additional_services: updatedAppointments.filter(a => a.additional_services?.length > 0).length
                }
            });
        } else {
            res.status(200).json({
                success: true,
                data: appointments,
                summary: {
                    total_appointments: 0,
                    with_groomer: 0,
                    with_additional_services: 0
                }
            });
        }
        
    } catch (error) {
        console.error('Error in getMyAppointments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointments',
            error: error.message
        });
    }
};

// GET SINGLE APPOINTMENT BY ID (only owner's appointments)
exports.getAppointmentById = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        console.log(`Pet owner fetching appointment ${appointmentId}`);
        
        // Sync payment status first
        console.log('Syncing payment status...');
        await Appointment.syncPaymentStatusWithPayments(appointmentId);
        
        // Get appointment with ALL details (additional services + groomer info)
        const appointment = await Appointment.findByIdWithPetDetails(appointmentId);
        
        if (!appointment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Appointment not found' 
            });
        }

        // Verify ownership
        if (appointment.owner_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. You can only view your own appointments.' 
            });
        }

        // Get additional payment context
        const payments = await Payment.findByAppointment(appointmentId);
        
        // Add payment details to response
        appointment.payment_records = payments;
        appointment.has_successful_payment = payments.some(p => p.status === 'completed');
        appointment.total_paid = payments
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + parseFloat(p.amount), 0);

        console.log(`Pet owner appointment ${appointmentId} details:`, {
            status: appointment.status,
            payment_status: appointment.payment_status,
            groomer_assigned: !!appointment.groomer_name,
            groomer_name: appointment.groomer_name,
            additional_services_count: appointment.additional_services?.length || 0,
            total_amount: appointment.total_amount,
            payment_records: payments.length
        });

        res.status(200).json({ 
            success: true, 
            data: appointment,
            debug_info: {
                has_groomer: !!appointment.groomer_name,
                groomer_name: appointment.groomer_name,
                has_additional_services: !!appointment.additional_services,
                additional_services_count: appointment.additional_services?.length || 0,
                is_additional_services_array: Array.isArray(appointment.additional_services)
            }
        });
        
    } catch (error) {
        console.error('Error fetching single appointment:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching appointment',
            error: error.message 
        });
    }
};


// CANCEL APPOINTMENT (pet owner can only cancel)
exports.cancelAppointment = async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const appointment = await Appointment.findById(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        // Ensure the appointment belongs to the logged-in user
        if (appointment.owner_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only cancel your own appointments.'
            });
        }

        // Check if appointment can be cancelled
        if (['completed', 'cancelled'].includes(appointment.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel appointment with status: ${appointment.status}`
            });
        }

        // Update appointment status
        await Appointment.updateStatus(appointmentId, 'cancelled');

      // Send notifications to owner AND staff about cancellation
try {
    const [appointmentDetails] = await db.execute(`
        SELECT p.name as pet_name, u.name as customer_name, gs.name as service_name,
               a.preferred_date, a.preferred_time
        FROM appointments a
        JOIN pets p ON p.id = a.pet_id
        JOIN users u ON u.id = a.owner_id 
        JOIN grooming_services gs ON gs.id = a.service_id
        WHERE a.id = ?
    `, [appointmentId]);

    if (appointmentDetails.length > 0) {
        const details = appointmentDetails[0];
        
        const [ownerRows] = await db.execute(`
            SELECT id FROM users WHERE role = 'owner' LIMIT 1
        `);

        const staffIds = await getActiveStaffMembers();
        
        const notificationData = {
            customerName: details.customer_name,
            petName: details.pet_name,
            serviceName: details.service_name,
            date: new Date(details.preferred_date).toLocaleDateString(),
            time: details.preferred_time
        };

        // Send to owner
        if (ownerRows.length > 0) {
            await ownerNotificationHelper.sendAppointmentCancelledNotification(
                ownerRows[0].id, 
                notificationData
            );
            console.log('✅ Owner notification sent');
        }

        // Send to all active staff
        for (const staffId of staffIds) {
            await ownerNotificationHelper.sendAppointmentCancelledNotification(
                staffId, 
                notificationData
            );
        }
        console.log(`Cancellation notifications sent to ${staffIds.length} staff members`);
    }
} catch (notificationError) {
    console.error('❌ Error sending cancellation notifications:', notificationError);
}

        // Success response
        res.status(200).json({
            success: true,
            message: 'Appointment cancelled successfully'
        });

    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling appointment',
            error: error.message
        });
    }
};


// GET AVAILABLE SERVICES (for appointment booking)
exports.getAvailableServices = async (req, res) => {
    try {
        const services = await GroomingService.findAvailable();
        res.status(200).json({
            success: true,
            data: services
        });
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available services',
            error: error.message
        });
    }
};

// GET APPOINTMENT HISTORY (past appointments)
exports.getAppointmentHistory = async (req, res) => {
    try {
        console.log('🔍 Pet owner fetching appointment history');
        
        const appointments = await Appointment.findByOwnerWithPetDetails(req.user.id);

        // Filter completed appointments with enhanced data
        const history = appointments.filter(appointment =>
            appointment.status === 'completed'
        );

        console.log(`Found ${history.length} completed appointments in history`);

        res.status(200).json({
            success: true,
            data: history,
            summary: {
                total_completed: history.length,
                with_additional_services: history.filter(a => a.additional_services?.length > 0).length
            }
        });
    } catch (error) {
        console.error('Error fetching appointment history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching appointment history',
            error: error.message
        });
    }
};

// GET UPCOMING APPOINTMENTS
exports.getUpcomingAppointments = async (req, res) => {
    try {
        console.log('Pet owner fetching upcoming appointments');
        
        const appointments = await Appointment.findByOwnerWithPetDetails(req.user.id);

        // Filter upcoming appointments with enhanced data
        const upcoming = appointments.filter(appointment =>
            ['pending', 'confirmed', 'in_progress'].includes(appointment.status)
        );

        console.log(`Found ${upcoming.length} upcoming appointments`);
        
        // Log groomer assignment status
        const withGroomer = upcoming.filter(a => a.groomer_name).length;
        console.log(`${withGroomer} appointments have assigned groomers`);

        res.status(200).json({
            success: true,
            data: upcoming,
            summary: {
                total_upcoming: upcoming.length,
                with_groomer: withGroomer,
                with_additional_services: upcoming.filter(a => a.additional_services?.length > 0).length
            }
        });
    } catch (error) {
        console.error('Error fetching upcoming appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching upcoming appointments',
            error: error.message
        });
    }
};


exports.getSpendingStats = async (req, res) => {
    try {
      console.log('Getting spending stats for user:', req.user.id);
      
      const appointments = await Appointment.findByOwnerWithPetDetails(req.user.id);
      
      // Calculate spending statistics
      const completedPaidAppointments = appointments.filter(appointment => 
        appointment.status === 'completed' && 
        appointment.payment_status === 'paid'
      );
      
      const totalSpent = completedPaidAppointments.reduce((total, appointment) => 
        total + parseFloat(appointment.total_amount || 0), 0
      );
      
      const completedAppointments = appointments.filter(a => a.status === 'completed').length;
      const paidAppointments = appointments.filter(a => a.payment_status === 'paid').length;
      
      res.status(200).json({
        success: true,
        data: {
          total_spent: totalSpent,
          completed_appointments: completedAppointments,
          paid_appointments: paidAppointments,
          average_spent_per_appointment: completedAppointments > 0 ? totalSpent / completedAppointments : 0,
          spending_breakdown: completedPaidAppointments.map(apt => ({
            id: apt.id,
            date: apt.preferred_date,
            amount: parseFloat(apt.total_amount || 0),
            service: apt.service_name
          }))
        }
      });
      
    } catch (error) {
      console.error('Error fetching spending stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching spending statistics',
        error: error.message
      });
    }
  };