// controllers/owner/walkInController.js
const WalkInBooking = require('../../models/WalkInBooking');
const PDFDocument = require('pdfkit');
const path = require("path");
const { sendNotificationToUser } = require('../../socketServer');
const Notification = require('../../models/Notification');
const { ActivityLogger } = require('../../utils/activityLogger'); // Import ActivityLogger

class WalkInController {
  // Search pet owners
  static async searchPetOwners(req, res) {
    try {
      console.log('=== SEARCH PET OWNERS ===');
      console.log('Query params:', req.query);
      
      const { search } = req.query;
      
      if (!search || search.trim().length < 2) {
        return res.status(400).json({ 
          success: false,
          message: 'Search term must be at least 2 characters long' 
        });
      }
      
      const owners = await WalkInBooking.searchPetOwners(search.trim());
      console.log(`Found ${owners.length} pet owners`);
      
      res.json({
        success: true,
        message: `Found ${owners.length} pet owners`,
        data: owners
      });
    } catch (error) {
      console.error('❌ Error searching pet owners:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to search pet owners',
        error: error.message 
      });
    }
  }

  // Get pets by owner
  static async getPetsByOwner(req, res) {
    try {
      console.log('=== GET PETS BY OWNER ===');
      console.log('Owner ID:', req.params.ownerId);
      
      const { ownerId } = req.params;
      
      if (!ownerId) {
        return res.status(400).json({ 
          success: false,
          message: 'Owner ID is required' 
        });
      }
      
      const pets = await WalkInBooking.getPetsByOwner(ownerId);
      console.log(`Found ${pets.length} pets for owner ${ownerId}`);
      
      res.json({
        success: true,
        message: `Found ${pets.length} pets`,
        data: pets
      });
    } catch (error) {
      console.error('❌ Error getting pets by owner:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get pets',
        error: error.message 
      });
    }
  }

  // Search pets
  static async searchPets(req, res) {
    try {
      console.log('=== SEARCH PETS ===');
      console.log('Query params:', req.query);
      
      const { search, ownerId } = req.query;
      
      if (!search || search.trim().length < 2) {
        return res.status(400).json({ 
          success: false,
          message: 'Search term must be at least 2 characters long' 
        });
      }
      
      const pets = await WalkInBooking.searchPets(search.trim(), ownerId);
      console.log(`Found ${pets.length} pets`);
      
      res.json({
        success: true,
        message: `Found ${pets.length} pets`,
        data: pets
      });
    } catch (error) {
      console.error('❌ Error searching pets:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to search pets',
        error: error.message 
      });
    }
  }

  // Get grooming services
  static async getGroomingServices(req, res) {
    try {
      console.log('=== GET GROOMING SERVICES ===');
      
      const services = await WalkInBooking.getGroomingServices();
      console.log(`Found ${services.length} available services`);
      
      res.json({
        success: true,
        message: `Found ${services.length} available services`,
        data: services
      });
    } catch (error) {
      console.error('❌ Error getting grooming services:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get grooming services',
        error: error.message 
      });
    }
  }

  // Get service price for specific pet size
  static async getServicePrice(req, res) {
    try {
      console.log('=== GET SERVICE PRICE ===');
      console.log('Service ID:', req.params.serviceId);
      console.log('Pet Size:', req.params.petSize);
      
      const { serviceId, petSize } = req.params;
      
      if (!serviceId || !petSize) {
        return res.status(400).json({ 
          success: false,
          message: 'Service ID and pet size are required' 
        });
      }
      
      const validSizes = ['xs', 'small', 'medium', 'large', 'xl', 'xxl'];
      if (!validSizes.includes(petSize.toLowerCase())) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid pet size. Valid sizes: XS, SMALL, MEDIUM, LARGE, XL, XXL' 
        });
      }
      
      const servicePrice = await WalkInBooking.getServicePrice(serviceId, petSize);
      
      if (!servicePrice) {
        return res.status(404).json({ 
          success: false,
          message: 'Service not found' 
        });
      }
      
      console.log(`Service price for ${servicePrice.name} (${petSize.toUpperCase()}): ₱${servicePrice.price}`);
      
      res.json({
        success: true,
        message: 'Service price retrieved successfully',
        data: {
          service_name: servicePrice.name,
          pet_size: petSize.toUpperCase(),
          price: servicePrice.price
        }
      });
    } catch (error) {
      console.error('❌ Error getting service price:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get service price',
        error: error.message 
      });
    }
  }

  // Get available groomers
  static async getAvailableGroomers(req, res) {
    try {
      console.log('=== GET AVAILABLE GROOMERS ===');
      
      const groomers = await WalkInBooking.getAvailableGroomers();
      console.log(`Found ${groomers.length} available groomers`);
      
      res.json({
        success: true,
        message: `Found ${groomers.length} available groomers`,
        data: groomers
      });
    } catch (error) {
      console.error('❌ Error getting groomers:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get groomers',
        error: error.message 
      });
    }
  }

  // Create walk-in booking
  static async createWalkInBooking(req, res) {
    try {
      console.log('=== CREATE WALK-IN BOOKING ===');
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      const {
        pet_id,
        owner_id,
        service_ids, 
        groomer_id,
        base_price,
        matted_coat_fee = 0,
        special_notes = '',
        time_slot,
        payment_method
      } = req.body;

      // Validation
      const requiredFields = ['pet_id', 'owner_id', 'service_ids', 'groomer_id', 'base_price', 'time_slot', 'payment_method'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
          required_fields: requiredFields,
          missing_fields: missingFields
        });
      }

      // Validate service_ids is an array
      if (!Array.isArray(service_ids) || service_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one service must be selected'
        });
      }

      const validPaymentMethods = ['Cash', 'Gcash'];
      if (!validPaymentMethods.includes(payment_method)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid payment method. Must be Cash or Gcash' 
        });
      }

      // Check if pet already has an active appointment today
      const activeAppointments = await WalkInBooking.getActiveAppointments();
      const petHasActiveAppointment = activeAppointments.some(appointment => 
        appointment.pet_id === parseInt(pet_id) && 
        ['pending', 'confirmed', 'in_progress'].includes(appointment.status)
      );

      if (petHasActiveAppointment) {
        const activeAppointment = activeAppointments.find(appointment => 
          appointment.pet_id === parseInt(pet_id) && 
          ['pending', 'confirmed', 'in_progress'].includes(appointment.status)
        );
        
        console.log(`❌ Pet ${pet_id} already has an active ${activeAppointment.booking_type} appointment today`);
        
        return res.status(409).json({
          success: false,
          message: `This pet already has an active ${activeAppointment.booking_type} appointment today (${activeAppointment.status}). Only one active appointment per pet is allowed.`,
          error_code: 'PET_HAS_ACTIVE_APPOINTMENT',
          active_appointment: {
            id: activeAppointment.id,
            type: activeAppointment.booking_type,
            status: activeAppointment.status,
            date: activeAppointment.preferred_date,
            time: activeAppointment.preferred_time,
            service: activeAppointment.service_name
          }
        });
      }

      // Calculate total amount
      const basePriceNum = parseFloat(base_price);
      const mattedCoatFeeNum = parseFloat(matted_coat_fee);
      const total_amount = basePriceNum + mattedCoatFeeNum;

      console.log(`Base Price: ₱${basePriceNum}`);
      console.log(`Matted Coat Fee: ₱${mattedCoatFeeNum}`);
      console.log(`Total Amount: ₱${total_amount}`);

      // Get next queue number
      const queue_number = await WalkInBooking.getNextQueueNumber();
      console.log(`Queue Number: ${queue_number}`);

      const bookingData = {
        pet_id: parseInt(pet_id),
        owner_id: parseInt(owner_id),
        service_ids: service_ids.map(id => parseInt(id)), // Array of service IDs
        groomer_id: parseInt(groomer_id),
        base_price: basePriceNum,
        matted_coat_fee: mattedCoatFeeNum,
        total_amount,
        special_notes,
        queue_number,
        time_slot,
        payment_method,
        payment_status: 'paid'
      };

      const bookingId = await WalkInBooking.createWalkInBookingWithServices(bookingData);
      console.log(`✅ Walk-in booking created with ID: ${bookingId}`);
      
      // Get the complete booking details
      const booking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);

      // Log activity for booking creation
      if (req.user && booking) {
        await ActivityLogger.log(
          req.user,
          'walk_in_create', // ✅ CHANGED from 'created'
          'walk_in',
          `Queue #${queue_number} - ${booking.pet_name}`,
          `Created walk-in for ${booking.owner_name}'s ${booking.pet_name} - ${booking.services?.map(s => s.name).join(', ')}. Amount: ₱${total_amount}`,
          req
        );
      }

      // Send notification to pet owner about walk-in booking creation
      if (booking && booking.owner_id) {
        try {
          const servicesText = booking.services && booking.services.length > 0 
            ? booking.services.map(s => s.name).join(', ')
            : booking.service_name || 'grooming service';
          
          const title = 'Walk-In Booking Created';
          const message = `Your walk-in booking for ${booking.pet_name} has been created! Queue #${queue_number} - Services: ${servicesText}`;
          
          console.log('🔍 BEFORE Notification.create in controller:');
          console.log('  - booking.owner_id:', booking.owner_id);
          console.log('  - title:', title);
          console.log('  - message length:', message.length);
          console.log('  - type parameter:', 'walk_in');
          console.log('  - type check:', JSON.stringify('walk_in'));
          // Save to database
          const dbNotification = await Notification.create(
            booking.owner_id,
            title,
            message,
            'walk_in'
          );

          // Send real-time notification
          sendNotificationToUser(booking.owner_id, {
            notification: {
              id: dbNotification.id,
              title,
              message,
              type: 'walk_in',
              is_read: false,
              created_at: new Date().toISOString(),
              walk_in_id: parseInt(bookingId)
            }
          });

          console.log('📨 Walk-in booking creation notification sent to user:', booking.owner_id);
        } catch (notificationError) {
          console.error('❌ Error sending walk-in booking creation notification:', notificationError);
          // Don't fail the whole request if notification fails
        }
      }

      res.status(201).json({
        success: true,
        message: 'Walk-in booking created successfully',
        data: {
          booking_id: bookingId,
          queue_number,
          booking_details: booking
        }
      });
    } catch (error) {
      console.error('❌ Error creating walk-in booking:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to create walk-in booking',
        error: error.message 
      });
    } 
  }

  // Get today's walk-in bookings
  static async getWalkInBookingById(req, res) {
    try {
      console.log('=== GET WALK-IN BOOKING DETAILS ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Booking ID type:', typeof req.params.bookingId);
      
      const { bookingId } = req.params;
      
      const booking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);
      
      if (!booking) {
        return res.status(404).json({ 
          success: false,
          message: 'Booking not found' 
        });
      }
      
      // ADD THESE DEBUG LOGS:
      console.log('=== SESSION DEBUG IN CONTROLLER ===');
      console.log('Active session exists:', !!booking.active_session);
      console.log('Active session data:', booking.active_session);
      console.log('Session history exists:', !!booking.session_history);
      console.log('Session history length:', booking.session_history ? booking.session_history.length : 0);
      console.log('Session history data:', booking.session_history);
      
      console.log(`Found booking for ${booking.owner_name} - ${booking.pet_name}`);
      
      res.json({
        success: true,
        message: 'Booking details retrieved successfully',
        data: booking
      });
    } catch (error) {
      console.error('Error getting booking details:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get booking details',
        error: error.message 
      });
    }
  }

  // Update time slot
  static async rescheduleWalkInTimeSlot(req, res) {
    try {
      console.log('=== RESCHEDULE WALK-IN TIME SLOT ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Request body:', req.body);
      
      const { bookingId } = req.params;
      const { new_time_slot, reschedule_reason } = req.body;
      
      // Validation
      if (!new_time_slot || !reschedule_reason) {
        return res.status(400).json({
          success: false,
          message: 'New time slot and reschedule reason are required'
        });
      }
      
      if (reschedule_reason.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Reschedule reason must be at least 10 characters'
        });
      }
      
      // Check if time slot is available (for today)
      const today = new Date().toISOString().split('T')[0];
      const bookedSlots = await WalkInBooking.getBookedTimeSlotsForDay(today);
      
      // Get current booking to exclude it from booked slots check
      const currentBooking = await WalkInBooking.getWalkInBookingById(bookingId);
      if (!currentBooking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      // Check if new time slot is available (excluding current booking's slot)
      const isSlotTaken = bookedSlots.includes(new_time_slot) && currentBooking.time_slot !== new_time_slot;
      if (isSlotTaken) {
        return res.status(409).json({
          success: false,
          message: 'Selected time slot is already booked'
        });
      }
      
      const updated = await WalkInBooking.rescheduleWalkInTimeSlot(
        bookingId, 
        new_time_slot, 
        reschedule_reason.trim()
      );
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or cannot be rescheduled'
        });
      }
      
      console.log(`✅ Booking ${bookingId} time slot updated to ${new_time_slot}`);

      // Log activity for rescheduling
      if (req.user) {
        await ActivityLogger.log(
          req.user,
          'walk_in_update', // ✅ CHANGED from 'rescheduled'
          'walk_in',
          `Booking #${bookingId}`,
          `Time slot changed to ${new_time_slot}. Reason: ${reschedule_reason.trim()}`,
          req
        );
      }
      
      // Add notification after the booking is successfully rescheduled
      const booking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);
      if (booking && booking.owner_id) {
        try {
          const title = 'Walk-In Service Rescheduled';
          const message = `Your walk-in service for ${booking.pet_name} has been rescheduled to ${new_time_slot}.`;
  
          // Save to database
          const dbNotification = await Notification.create(
            booking.owner_id,
            title,
            message,
            'walk_in'
          );
  
          // Send real-time notification
          sendNotificationToUser(booking.owner_id, {
            notification: {
              id: dbNotification.id,
              title,
              message,
              type: 'walk_in',
              is_read: false,
              created_at: new Date().toISOString(),
              walk_in_id: parseInt(bookingId)
            }
          });
  
          console.log('📨 Walk-in reschedule notification sent to user:', booking.owner_id);
        } catch (notificationError) {
          console.error('❌ Error sending walk-in reschedule notification:', notificationError);
          // Don't fail the whole request if notification fails
        }
      }
      
      res.json({
        success: true,
        message: 'Time slot updated successfully',
        data: { 
          booking_id: bookingId, 
          new_time_slot,
          reschedule_reason
        }
      });
    } catch (error) {
      console.error('❌ Error updating time slot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update time slot',
        error: error.message
      });
    }
  }

  static async getTodayWalkInBookings(req, res) {
    try {
      console.log('=== GET TODAY\'S WALK-IN BOOKINGS ===');
      
      const bookings = await WalkInBooking.getTodayWalkInBookingsWithServices();
      console.log(`Found ${bookings.length} bookings for today`);
      
      res.json({
        success: true,
        message: `Found ${bookings.length} bookings for today`,
        data: bookings
      });
    } catch (error) {
      console.error('❌ Error getting today\'s bookings:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get today\'s bookings',
        error: error.message 
      });
    }
  }
  
  // Get dashboard stats
  static async getDashboardStats(req, res) {
    try {
      console.log('=== GET DASHBOARD STATS ===');
      
      const stats = await WalkInBooking.getTodayStats();
      console.log('Today\'s stats:', stats);
      
      res.json({
        success: true,
        message: 'Dashboard statistics retrieved successfully',
        data: stats
      });
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get dashboard statistics',
        error: error.message 
      });
    }
  }

  // ✅ Update booking status (full code)
static async updateBookingStatus(req, res) {
  try {
    console.log('=== UPDATE BOOKING STATUS ===');
    console.log('Booking ID:', req.params.bookingId);
    console.log('New Status:', req.body.status);

    const { bookingId } = req.params;
    const { status } = req.body;

    // ✅ Validate status
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid status. Valid statuses: pending, in_progress, completed, cancelled'
      });
    }

    // ✅ Update booking status in DB
    const updated = await WalkInBooking.updateBookingStatus(bookingId, status);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log(`✅ Booking ${bookingId} status updated to: ${status}`);

    // ✅ Log activity for specific status
    if (req.user) {
      if (status === 'completed') {
        await ActivityLogger.log(
          req.user,
          'walk_in_complete', // specific action
          'walk_in',
          `Booking #${bookingId}`,
          `Marked as completed`,
          req
        );
      } else if (status === 'cancelled') {
        await ActivityLogger.log(
          req.user,
          'walk_in_cancel', // specific action
          'walk_in',
          `Booking #${bookingId}`,
          `Cancelled booking`,
          req
        );
      } else {
        // For all other status updates
        await ActivityLogger.log(
          req.user,
          'updated',
          'walk_in_booking_status',
          `Booking #${bookingId}`,
          `Status changed to ${status}`,
          req
        );
      }
    }

    // ✅ Send response
    res.json({
      success: true,
      message: `Booking status updated to ${status}`,
      data: { booking_id: bookingId, new_status: status }
    });
  } catch (error) {
    console.error('❌ Error updating booking status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
}


  // Generate receipt
  static async generateReceipt(req, res) {
    try {
      console.log("=== GENERATE RECEIPT PDF ===");
      console.log("Booking ID:", req.params.bookingId);
  
      const { bookingId } = req.params;
  
      // Fetch booking data
      const booking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }
  
      // DEBUG: Log the payment history to see what we're getting
      console.log("Payment history from booking:", JSON.stringify(booking.payment_history, null, 2));
  
      // Create PDF
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const filename = `receipt-${bookingId}-${Date.now()}.pdf`;
  
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      doc.pipe(res);
  
      // Register fonts
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
        .text(`Receipt #${bookingId}`, 350, 45, { align: "right" })
        .font("Poppins").fontSize(10)
        .text(`Queue No: ${booking.queue_number}`, { align: "right" })
        .text(`Date: ${new Date(booking.created_at).toLocaleDateString()}`, { align: "right" })
        .text(`Time Slot: ${booking.time_slot}`, { align: "right" });
  
      // Divider line
      doc.moveTo(40, 130).lineTo(550, 130).strokeColor("#aaa").stroke();
  
      // ---------------- CUSTOMER & PET INFO ----------------
      let y = 150;
      doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Customer Information", 40, y);
      doc.font("Poppins").fontSize(10).fillColor("#000")
        .text(`Name: ${booking.owner_name}`, 40, y + 20)
        .text(`Contact: ${booking.owner_contact}`, 40, y + 35)
        .text(`Email: ${booking.owner_email}`, 40, y + 50);
  
      doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Pet Information", 300, y);
      doc.font("Poppins").fontSize(10).fillColor("#000")
        .text(`Pet: ${booking.pet_name}`, 300, y + 20)
        .text(`Breed: ${booking.breed}`, 300, y + 35)
        .text(`Type: ${booking.type}`, 300, y + 50)
        .text(`Size: ${booking.size}`, 300, y + 65)
  
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

      // ✅ CORRECTED: Use the final total_amount from booking instead of calculating
      let displayTotal = parseFloat(booking.total_amount) || 0;

      // Display services from booking.services array
      if (booking.services && booking.services.length > 0) {
        booking.services.forEach((service, index) => {
          const servicePrice = parseFloat(service.price) || 0;
          const serviceLabel = service.is_addon ? `${service.name} (Add-on)` : service.name;
          doc.font("Poppins").fontSize(10)
            .text(`${index + 1}`, 40, y + 5)
            .text(serviceLabel, 70, y + 5)
            .text(servicePrice.toFixed(2), 400, y + 5, { align: "right" });
          y += 20;
        });
      } else {
        // Fallback for older bookings without services array
        const basePrice = parseFloat(booking.base_price) || 0;
        doc.font("Poppins").fontSize(10)
          .text("1", 40, y + 5)
          .text(booking.service_name || "Grooming Service", 70, y + 5)
          .text(basePrice.toFixed(2), 400, y + 5, { align: "right" });
        y += 20;
      }

      // Matted Coat Fee (if applicable)
      if (booking.matted_coat_fee && parseFloat(booking.matted_coat_fee) > 0) {
        const fee = parseFloat(booking.matted_coat_fee);
        const serviceCount = booking.services ? booking.services.length + 1 : 2;
        doc.text(`${serviceCount}`, 40, y + 5)
          .text("Matted Coat Fee", 70, y + 5)
          .text(fee.toFixed(2), 400, y + 5, { align: "right" });
        y += 20;
      }

      // Divider before total
      doc.moveTo(40, y).lineTo(550, y).strokeColor("#000").stroke();
      y += 10;

      // TOTAL - Use the actual total_amount from booking
      doc.font("Poppins-Bold").fontSize(12).fillColor("#623669")
        .text("TOTAL", 70, y)
        .text(`PHP ${displayTotal.toFixed(2)}`, 400, y, { align: "right" });
        
      y += 30;
  
      // ---------------- PAYMENT INFO ----------------
      doc.font("Poppins-Bold").fontSize(12).fillColor("#623669").text("Payment Information", 40, y);
      y += 20;
      
      // FIXED: Better logic for extracting payment methods
      let paymentMethods = "N/A";
      let paymentStatus = "Pending";
      
      if (booking.payment_history && booking.payment_history.length > 0) {
        // Extract unique payment methods from payment history
        const uniquePaymentMethods = [...new Set(booking.payment_history.map(p => p.payment_method))];
        paymentMethods = uniquePaymentMethods.join(", ");
        
        // Calculate total paid amount
        const totalPaid = booking.payment_history.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
        const expectedTotal = parseFloat(booking.total_amount || 0);
        
        // Determine payment status based on amounts
        if (totalPaid >= expectedTotal) {
          paymentStatus = "Paid";
        } else if (totalPaid > 0) {
          paymentStatus = "Partially Paid";
        } else {
          paymentStatus = "Pending";
        }
        
        console.log(`Payment Methods: ${paymentMethods}`);
        console.log(`Total Paid: ${totalPaid}, Expected: ${expectedTotal}`);
        console.log(`Payment Status: ${paymentStatus}`);
      } else {
        // Fallback to booking payment_method if no payment history
        paymentMethods = booking.payment_method || "N/A";
        paymentStatus = booking.payment_status || "Pending";
      }
      
      doc.font("Poppins").fontSize(10).fillColor("#623669")
        .text(`Payment Methods: ${paymentMethods}`, 40, y)
        .text(`Payment Status: ${paymentStatus.toUpperCase()}`, 40, y + 15);
  
      // Add payment breakdown if multiple payments
      if (booking.payment_history && booking.payment_history.length > 1) {
        y += 40;
        doc.font("Poppins-Bold").fontSize(10).fillColor("#623669").text("Payment Breakdown:", 40, y);
        y += 15;
        
        booking.payment_history.forEach((payment, index) => {
          const paymentDate = new Date(payment.created_at).toLocaleDateString();
          const paymentText = `${index + 1}. ${payment.payment_method} - PHP ${parseFloat(payment.amount).toFixed(2)} (${payment.payment_type}) - ${paymentDate}`;
          doc.font("Poppins").fontSize(9).fillColor("#555").text(paymentText, 40, y);
          y += 12;
        });
      }
  
      // ---------------- FOOTER ----------------
      y += 30;
      doc.font("Poppins-Bold").fontSize(12).fillColor("#623669")
        .text("Thank you for trusting Mimi's Pet Grooming!", 40, y, { align: "center" });
      doc.font("Poppins").fontSize(9).fillColor("#555")
        .text("This receipt is system-generated. No signature required.", 40, y + 20, { align: "center" });
  
      // Finalize PDF
      doc.end();
  
    } catch (error) {
      console.error("Error generating receipt:", error);
      res.status(500).json({ success: false, message: "Failed to generate receipt", error: error.message });
    }
  }

  // Send receipt via email (placeholder)
  static async sendReceipt(req, res) {
    try {
      console.log('=== SEND RECEIPT EMAIL ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Email:', req.body.email);
      
      const { bookingId } = req.params;
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ 
          success: false,
          message: 'Email address is required' 
        });
      }
      
      const booking = await WalkInBooking.getWalkInBookingById(bookingId);
      
      if (!booking) {
        return res.status(404).json({ 
          success: false,
          message: 'Booking not found' 
        });
      }

      // TODO: Implement email sending service (nodemailer, SendGrid, etc.)
      // For now, just return success message
      console.log(`📧 Receipt would be sent to: ${email}`);
      
      res.json({
        success: true,
        message: `Receipt will be sent to ${email}`,
        data: { 
          booking_id: bookingId,
          email: email,
          status: 'email_queued' 
        }
      });
      
    } catch (error) {
      console.error('❌ Error sending receipt:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to send receipt',
        error: error.message 
      });
    }
  }

  // Get active appointments for pets (TODAY ONLY)
  static async getActiveAppointments(req, res) {
    try {
      console.log('=== GET ACTIVE APPOINTMENTS (TODAY) ===');
      const today = new Date().toISOString().split('T')[0];
      console.log('Today date:', today);
      
      const activeAppointments = await WalkInBooking.getActiveAppointments();
      console.log('Active appointments found:', JSON.stringify(activeAppointments, null, 2));
      
      res.json({
        success: true,
        message: `Found ${activeAppointments.length} active appointments for today`,
        data: activeAppointments
      });
    } catch (error) {
      console.error('Error getting active appointments:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get active appointments',
        error: error.message 
      });
    }
  }
  
  // Add this method to WalkInController class:
  static async getBookedTimeSlots(req, res) {
    try {
      console.log('=== GET BOOKED TIME SLOTS FOR TODAY ===');
      const { date } = req.query;
      const today = date || new Date().toISOString().split('T')[0];
      
      const bookedSlots = await WalkInBooking.getBookedTimeSlotsForDay(today);
      console.log(`Found ${bookedSlots.length} booked time slots for ${today}`);
      
      res.json({
        success: true,
        message: `Found ${bookedSlots.length} booked time slots`,
        data: bookedSlots
      });
    } catch (error) {
      console.error('Error getting booked time slots:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get booked time slots',
        error: error.message 
      });
    }
  }

  // Update booking groomer
  static async updateBookingGroomer(req, res) {
    try {
      console.log('=== UPDATE BOOKING GROOMER ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('New Groomer ID:', req.body.groomer_id);
      
      const { bookingId } = req.params;
      const { groomer_id } = req.body;
      
      if (!groomer_id) {
        return res.status(400).json({
          success: false,
          message: 'Groomer ID is required'
        });
      }
      
      const updated = await WalkInBooking.updateBookingGroomer(bookingId, groomer_id);
      
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      console.log(`✅ Booking ${bookingId} groomer updated to: ${groomer_id}`);

      // Log activity for groomer update
      if (req.user) {
        await ActivityLogger.log(
          req.user,
          'updated',
          'walk_in_booking_groomer',
          `Booking #${bookingId}`,
          `Groomer changed to ID: ${groomer_id}`,
          req
        );
      }
      
      res.json({
        success: true,
        message: 'Groomer updated successfully',
        data: { booking_id: bookingId, groomer_id }
      });
    } catch (error) {
      console.error('❌ Error updating booking groomer:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update groomer',
        error: error.message
      });
    }
  }
  
  // Upload before/after grooming photos
  static async uploadGroomingPhotos(req, res) {
    try {
      console.log('=== UPLOAD GROOMING PHOTOS ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Files:', req.files);

      const { bookingId } = req.params;
      const beforePhoto = req.files['before_photo'] ? req.files['before_photo'][0].filename : null;
      const afterPhoto = req.files['after_photo'] ? req.files['after_photo'][0].filename : null;

      if (!beforePhoto && !afterPhoto) {
        return res.status(400).json({
          success: false,
          message: 'No photos uploaded'
        });
      }

      // Save into DB (assuming you add columns in walk_in_bookings table)
      const updated = await WalkInBooking.saveGroomingPhotos(bookingId, beforePhoto, afterPhoto);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found or could not update photos'
        });
      }

      // Log activity for photo upload
      if (req.user) {
        const photoTypes = [];
        if (beforePhoto) photoTypes.push('before');
        if (afterPhoto) photoTypes.push('after');
        
        await ActivityLogger.log(
          req.user,
          'uploaded',
          'grooming_photos',
          `Booking #${bookingId}`,
          `Uploaded ${photoTypes.join(' and ')} photo(s)`,
          req
        );
      }

      res.json({
        success: true,
        message: 'Photos uploaded successfully',
        data: {
          booking_id: bookingId,
          before_photo: beforePhoto,
          after_photo: afterPhoto,
          has_photos: true
        }
      });
    } catch (error) {
      console.error('❌ Error uploading photos:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload photos',
        error: error.message
      });
    }
  }

  static async addServicesToBooking(req, res) {
    try {
      console.log('=== ADD SERVICES TO BOOKING ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      const { bookingId } = req.params;
      const { 
        service_ids, 
        payment_method,
        add_matted_coat_fee,
        matted_coat_fee_amount 
      } = req.body;
      
      // Validation - at least one service or matted coat fee must be selected
      if ((!service_ids || service_ids.length === 0) && !add_matted_coat_fee) {
        return res.status(400).json({
          success: false,
          message: 'At least one service or matted coat fee must be selected'
        });
      }

      // Payment method validation
      if (!payment_method) {
        return res.status(400).json({
          success: false,
          message: 'Payment method is required for add-on services'
        });
      }

      const validPaymentMethods = ['Cash', 'Gcash'];
      if (!validPaymentMethods.includes(payment_method)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid payment method. Must be Cash or Gcash' 
        });
      }
      
      // Check if booking exists and is not completed/cancelled
      const booking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      if (['completed', 'cancelled'].includes(booking.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot add services to ${booking.status} booking`
        });
      }
      
      // Check if matted coat fee is already applied
      if (add_matted_coat_fee && parseFloat(booking.matted_coat_fee) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Matted coat fee is already applied to this booking'
        });
      }
      
      // Get current service IDs to avoid duplicates
      const currentServiceIds = booking.services 
        ? booking.services.map(s => s.id)
        : [booking.service_id];
      
      // Filter out already existing services
      let newServiceIds = [];
      if (service_ids && service_ids.length > 0) {
        newServiceIds = service_ids.filter(id => !currentServiceIds.includes(parseInt(id)));
        
        if (newServiceIds.length === 0 && !add_matted_coat_fee) {
          return res.status(400).json({
            success: false,
            message: 'All selected services are already added to this booking'
          });
        }
      }
      
      // Prepare matted coat fee data
      let mattedCoatFeeData = null;
      if (add_matted_coat_fee) {
        mattedCoatFeeData = {
          add_matted_coat_fee: true,
          amount: matted_coat_fee_amount || 80
        };
      }
      
      // Add services and/or matted coat fee
      const result = await WalkInBooking.addServicesToBooking(
        bookingId, 
        newServiceIds.length > 0 ? newServiceIds : null, 
        payment_method,
        mattedCoatFeeData
      );
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.message || 'Failed to add services'
        });
      }
      
      console.log(`✅ Added ${newServiceIds.length} services and matted coat fee: ${result.matted_coat_fee_added} to booking ${bookingId}`);
      console.log(`New total amount: ₱${result.new_total}`);

      // Log activity for adding services
      if (req.user) {
        let addedItems = [];
        if (newServiceIds.length > 0) {
          addedItems.push(`${newServiceIds.length} service${newServiceIds.length > 1 ? 's' : ''}`);
        }
        if (result.matted_coat_fee_added > 0) {
          addedItems.push('matted coat fee');
        }
        const addedItemsText = addedItems.join(' and ');

        await ActivityLogger.log(
          req.user,
          'added',
          'booking_services',
          `Booking #${bookingId}`,
          `Added ${addedItemsText}. New total: ₱${result.new_total}`,
          req
        );
      }
      
      // Get updated booking details
      const updatedBooking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);
      
      // Build response message
      let addedItems = [];
      if (newServiceIds.length > 0) {
        addedItems.push(`${newServiceIds.length} service${newServiceIds.length > 1 ? 's' : ''}`);
      }
      if (result.matted_coat_fee_added > 0) {
        addedItems.push('matted coat fee');
      }
      const addedItemsText = addedItems.join(' and ');
      
      res.json({
        success: true,
        message: `${addedItemsText} added successfully`,
        data: {
          booking_id: bookingId,
          added_services: newServiceIds,
          matted_coat_fee_added: result.matted_coat_fee_added,
          new_total_amount: result.new_total,
          payment_method: payment_method,
          updated_booking: updatedBooking
        }
      });
    } catch (error) {
      console.error('❌ Error adding services to booking:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add services to booking',
        error: error.message
      });
    }
  }
  
  static async getYesterdayWalkInBookings(req, res) {
    try {
      console.log('=== GET YESTERDAY\'S WALK-IN BOOKINGS ===');
      
      const bookings = await WalkInBooking.getYesterdayWalkInBookingsWithServices();
      console.log(`Found ${bookings.length} bookings for yesterday`);
      
      res.json({
        success: true,
        message: `Found ${bookings.length} bookings for yesterday`,
        data: bookings
      });
    } catch (error) {
      console.error('❌ Error getting yesterday\'s bookings:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get yesterday\'s bookings',
        error: error.message 
      });
    }
  }

  static async getHistoryWalkInBookings(req, res) {
    try {
      console.log('=== GET WALK-IN BOOKINGS HISTORY ===');
      
      // Get status from query parameter, default to 'all'
      const { status = 'all' } = req.query;
      
      const bookings = await WalkInBooking.getHistoryWalkInBookingsWithServices(status);
      console.log(`Found ${bookings.length} historical bookings for status: ${status}`);
      
      res.json({
        success: true,
        message: `Found ${bookings.length} historical bookings`,
        data: bookings
      });
    } catch (error) {
      console.error('❌ Error getting booking history:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get booking history',
        error: error.message 
      });
    }
  }

  static async cancelBooking(req, res) {
    try {
      console.log('=== CANCEL WALK-IN BOOKING ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Request body:', JSON.stringify(req.body, null, 2));
      
      const { bookingId } = req.params;
      const { cancellation_reason, cancelled_by, refund_eligible } = req.body;
      
      // Validation
      console.log('Validation check - cancellation_reason:', cancellation_reason);
      console.log('Validation check - cancelled_by:', cancelled_by);
      
      if (!cancellation_reason || !cancelled_by) {
        console.log('❌ Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Cancellation reason and cancelled_by are required'
        });
      }
      
      if (!['owner', 'staff', 'customer'].includes(cancelled_by)) {
        console.log('❌ Invalid cancelled_by value:', cancelled_by);
        return res.status(400).json({
          success: false,
          message: 'cancelled_by must be "owner", "staff", or "customer"'
        });
      }
      
      console.log('✅ Validation passed, calling model method...');
      
      // Get the booking details first (before cancellation) to access owner_id and pet_name
      const booking = await WalkInBooking.findById(bookingId);
      if (!booking) {
        console.log('❌ Booking not found');
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      
      const cancelled = await WalkInBooking.cancelWalkInBooking(bookingId, {
        cancellation_reason: cancellation_reason.trim(),
        cancelled_by,
        refund_eligible: refund_eligible || false
      });
      
      console.log('Model method result:', cancelled);
      
      if (!cancelled) {
        console.log('❌ Model returned false - booking cannot be cancelled');
        return res.status(400).json({
          success: false,
          message: 'Booking cannot be cancelled (may already be completed or cancelled)'
        });
      }
      
      console.log(`✅ Booking ${bookingId} cancelled by ${cancelled_by}, refund: ${refund_eligible}`);

      // Log activity for cancellation
      if (req.user) {
        await ActivityLogger.log(
          req.user,
          'walk_in_cancel', // ✅ CHANGED from 'cancelled'
          'walk_in',
          `Booking #${bookingId}`,
          `Cancelled by ${cancelled_by}. Reason: ${cancellation_reason.trim()}. Refund eligible: ${refund_eligible}`,
          req
        );
      }
      
      // Add notification after the booking is successfully cancelled
      if (booking.owner_id) {
        try {
          const refundMessage = refund_eligible ? ' A refund will be processed.' : '';
          const title = 'Walk-In Service Cancelled';
          const message = `Your walk-in service for ${booking.pet_name} has been cancelled.${refundMessage}`;

          // Save to database
          const dbNotification = await Notification.create(
            booking.owner_id,
            title,
            message,
            'walk_in'
          );

          // Send real-time notification
          sendNotificationToUser(booking.owner_id, {
            notification: {
              id: dbNotification.id,
              title,
              message,
              type: 'walk_in',
              is_read: false,
              created_at: new Date().toISOString(),
              walk_in_id: parseInt(bookingId)
            }
          });

          console.log('Walk-in cancellation notification sent to user:', booking.owner_id);
        } catch (notificationError) {
          console.error('Error sending walk-in cancellation notification:', notificationError);
          // Don't fail the whole request if notification fails
        }
      }
      
      res.json({
        success: true,
        message: 'Booking cancelled successfully',
        data: {
          booking_id: bookingId,
          cancelled_by,
          refund_eligible,
          cancellation_reason
        }
      });
    } catch (error) {
      console.error('❌ Error cancelling booking:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel booking',
        error: error.message
      });
    }
  }
  
  // Start grooming session
  static async startGroomingSession(req, res) {
    try {
      console.log('=== START GROOMING SESSION ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Groomer ID:', req.body.groomer_id);
      
      const { bookingId } = req.params;
      const { groomer_id } = req.body;
      
      if (!groomer_id) {
        return res.status(400).json({
          success: false,
          message: 'Groomer ID is required'
        });
      }
      
      const session = await WalkInBooking.startGroomingSession(bookingId, groomer_id);
      
      console.log(`✅ Grooming session started for booking ${bookingId}`);

      // Log activity for session start
      if (req.user) {
        await ActivityLogger.log(
          req.user,
          'started',
          'grooming_session',
          `Booking #${bookingId}`,
          `Grooming session started with groomer ID: ${groomer_id}`,
          req
        );
      }
      
      // Add notification after the session is successfully started
      try {
        // Get the booking details to access owner_id and pet_name
        const booking = await WalkInBooking.findById(bookingId);
        
        if (booking && booking.owner_id) {
          const title = 'Walk-In Service Started';
          const message = `Your walk-in grooming service for ${booking.pet_name} has started! Queue #${booking.queue_number}`;

          // Save to database
          const dbNotification = await Notification.create(
            booking.owner_id,
            title,
            message,
            'walk_in'
          );

          // Send real-time notification
          sendNotificationToUser(booking.owner_id, {
            notification: {
              id: dbNotification.id,
              title,
              message,
              type: 'walk_in',
              is_read: false,
              created_at: new Date().toISOString(),
              walk_in_id: parseInt(bookingId)
            }
          });

          console.log('📨 Walk-in start notification sent to user:', booking.owner_id);
        }
      } catch (notificationError) {
        console.error('❌ Error sending walk-in start notification:', notificationError);
        // Don't fail the whole request if notification fails
      }
      
      res.json({
        success: true,
        message: 'Grooming session started successfully',
        data: session
      });
    } catch (error) {
      console.error('❌ Error starting grooming session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start grooming session',
        error: error.message
      });
    }
  }

  // End grooming session
  static async endGroomingSession(req, res) {
    try {
      console.log('=== END GROOMING SESSION ===');
      console.log('Booking ID:', req.params.bookingId);
      console.log('Request body:', req.body);
      
      const { bookingId } = req.params;
      
      const session = await WalkInBooking.endGroomingSession(bookingId);
      
      console.log(`✅ Grooming session ended for booking ${bookingId}`);
      console.log(`Duration: ${session.durationMinutes} minutes`);

      // Log activity for session end
      if (req.user) {
        await ActivityLogger.log(
          req.user,
          'completed',
          'grooming_session',
          `Booking #${bookingId}`,
          `Grooming session completed. Duration: ${session.durationMinutes} minutes`,
          req
        );
      }
      
      // Add notification after the session is successfully ended
      try {
        // Get the booking details to access owner_id and pet_name
        const booking = await WalkInBooking.getWalkInBookingByIdWithServices(bookingId);
        
        if (booking && booking.owner_id) {
          const title = 'Walk-In Service Completed';
          const message = `Your walk-in grooming service for ${booking.pet_name} has been completed! Your pet is ready for pickup.`;

          // Save to database
          const dbNotification = await Notification.create(
            booking.owner_id,
            title,
            message,
            'walk_in'
          );

          // Send real-time notification
          sendNotificationToUser(booking.owner_id, {
            notification: {
              id: dbNotification.id,
              title,
              message,
              type: 'walk_in',
              is_read: false,
              created_at: new Date().toISOString(),
              walk_in_id: parseInt(bookingId)
            }
          });

          console.log('📨 Walk-in completion notification sent to user:', booking.owner_id);
        }
      } catch (notificationError) {
        console.error('❌ Error sending walk-in completion notification:', notificationError);
        // Don't fail the whole request if notification fails
      }
      
      res.json({
        success: true,
        message: 'Grooming session completed successfully',
        data: session
      });
    } catch (error) {
      console.error('❌ Error ending grooming session:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to end grooming session',
        error: error.message
      });
    }
  }

  // Get session details
  static async getSessionDetails(req, res) {
    try {
      console.log('=== GET SESSION DETAILS ===');
      console.log('Booking ID:', req.params.bookingId);
      
      const { bookingId } = req.params;
      
      const activeSession = await WalkInBooking.getActiveSession(bookingId);
      const sessionHistory = await WalkInBooking.getSessionHistory(bookingId);
      
      res.json({
        success: true,
        message: 'Session details retrieved successfully',
        data: {
          active_session: activeSession,
          session_history: sessionHistory
        }
      });
    } catch (error) {
      console.error('❌ Error getting session details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session details',
        error: error.message
      });
    }
  }

  // Get all walk-in ratings
  static async getAllWalkInRatings(req, res) {
    try {
      console.log('=== GET ALL WALK-IN RATINGS ===');
      
      const { page = 1, limit = 20, rating, dateFrom, dateTo } = req.query;
      
      const filters = {};
      if (rating) filters.rating = parseInt(rating);
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      
      const result = await WalkInBooking.getAllWalkInRatings(
        parseInt(page), 
        parseInt(limit),
        filters
      );
      
      console.log(`Found ${result.ratings.length} ratings`);
      
      res.json({
        success: true,
        message: `Found ${result.ratings.length} ratings`,
        data: result.ratings,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalRecords: result.totalRecords,
          hasMore: result.hasMore
        }
      });
    } catch (error) {
      console.error('Error getting all walk-in ratings:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get ratings',
        error: error.message 
      });
    }
  }

  // Get walk-in rating statistics
  static async getWalkInRatingStats(req, res) {
    try {
      console.log('=== GET WALK-IN RATING STATS ===');
      
      const stats = await WalkInBooking.getWalkInRatingStats();
      
      res.json({
        success: true,
        message: 'Rating statistics retrieved successfully',
        data: stats
      });
    } catch (error) {
      console.error('Error getting rating stats:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get rating statistics',
        error: error.message 
      });
    }
  }

  // Get rating for a specific booking
  static async getBookingRating(req, res) {
    try {
      const { bookingId } = req.params;
      
      const rating = await WalkInBooking.getWalkInRatingWithDetails(bookingId);
      
      if (!rating) {
        return res.status(404).json({
          success: false,
          message: 'No rating found for this booking'
        });
      }
      
      res.json({
        success: true,
        message: 'Rating retrieved successfully',
        data: rating
      });
    } catch (error) {
      console.error('Error getting booking rating:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get booking rating',
        error: error.message 
      });
    }
  }
}

module.exports = WalkInController;