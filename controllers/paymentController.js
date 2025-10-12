// controllers/paymentController.js
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const emailService = require('../utils/email'); // Import the email service
const ownerNotificationHelper = require('../utils/ownerNotificationHelper');

// Mock GCash API configuration
const GCASH_CONFIG = {
  baseURL: process.env.GCASH_API_URL || 'https://mock-gcash-api.com/v1',
  merchantId: process.env.GCASH_MERCHANT_ID || 'MOCK_MERCHANT_123',
  secretKey: process.env.GCASH_SECRET_KEY || 'mock_secret_key',
  publicKey: process.env.GCASH_PUBLIC_KEY || 'mock_public_key'
};

// CREATE PAYMENT FOR APPOINTMENT
exports.createPayment = async (req, res) => {
  try {
    const { appointment_id, payment_method = 'gcash' } = req.body;

    if (payment_method !== 'gcash') {
      return res.status(400).json({
        success: false,
        message: 'Only GCash payments are currently supported'
      });
    }

    // Get appointment details
    const appointment = await Appointment.findByIdWithPetDetails(appointment_id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify appointment belongs to user
    if (appointment.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only pay for your own appointments.'
      });
    }

    // Check if appointment is already paid
    const hasSuccessfulPayment = await Payment.hasSuccessfulPayment(appointment_id);
    if (hasSuccessfulPayment) {
      return res.status(400).json({
        success: false,
        message: 'This appointment has already been paid for'
      });
    }

    // Check if appointment can be paid
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Payment can only be made for pending or confirmed appointments'
      });
    }

    // Create payment record
    const paymentData = {
      appointment_id: appointment.id,
      user_id: req.user.id,
      amount: appointment.total_amount,
      payment_method: 'gcash',
      status: 'pending'
    };

    const paymentId = await Payment.create(paymentData);

    // Mock GCash payment initialization
    const gcashPayment = await initializeGCashPayment({
      paymentId: paymentId,
      amount: appointment.total_amount,
      description: `Pet Grooming - ${appointment.service_name} for ${appointment.pet.name}`,
      customerEmail: req.user.email,
      customerName: appointment.owner_name,
      appointmentId: appointment.id
    });

    // Update payment with GCash transaction details
    await Payment.update(paymentId, {
      gcash_transaction_id: gcashPayment.transactionId,
      gcash_payment_url: gcashPayment.paymentUrl,
      external_reference: gcashPayment.referenceNumber
    });

    // 🔥 MOCK: Auto-complete payment after 8 seconds (simulating successful GCash payment)
    setTimeout(async () => {
      try {
        console.log(`🎯 Mock: Auto-completing payment ${paymentId} after simulated GCash processing`);
        
        // Update payment to completed
        await Payment.update(paymentId, {
          status: 'completed',
          paid_at: new Date(),
          gcash_response: JSON.stringify({
            transaction_id: gcashPayment.transactionId,
            reference_number: gcashPayment.referenceNumber,
            status: 'completed',
            amount: appointment.total_amount,
            payment_date: new Date().toISOString(),
            mock_payment: true
          })
        });

        // Sync appointment payment status
        await Appointment.syncPaymentStatusWithPayments(appointment_id);
        
        console.log(`✅ Mock payment completed for appointment ${appointment_id}`);
// 🔔 Notify owner about payment received
try {
  const [ownerRows] = await db.execute(`
    SELECT id FROM users WHERE role = 'owner' LIMIT 1
  `);

  if (ownerRows.length > 0) {
    const ownerId = ownerRows[0].id;

    await ownerNotificationHelper.sendPaymentReceivedNotification(ownerId, {
      amount: appointment.total_amount,
      customerName: appointment.owner_name,
      petName: appointment.pet.name
    });

    console.log(`✅ Owner notified of payment for appointment ${appointment_id}`);
  }
} catch (notifyError) {
  console.error('❌ Error sending owner payment notification:', notifyError);
}

        // 📧 SEND EMAIL NOTIFICATIONS AFTER SUCCESSFUL PAYMENT
        try {
          // Get user email from database since it's not in the JWT token
          const userDetails = await getUserById(req.user.id);
          
          if (!userDetails || !userDetails.email) {
            console.error('❌ Could not fetch user email for ID:', req.user.id);
            throw new Error('User email is required for sending confirmation');
          }
        
          const paymentDetails = {
            userEmail: userDetails.email,
            userName: userDetails.name || req.user.name || appointment.owner_name,
            paymentId: paymentId,
            amount: appointment.total_amount,
            referenceNumber: gcashPayment.referenceNumber,
            paidAt: new Date(),
            appointmentId: appointment.id,
            appointmentDate: appointment.preferred_date,
            appointmentTime: appointment.preferred_time,
            petName: appointment.pet.name,
            serviceName: appointment.service_name,
            serviceCategory: appointment.service_category || 'Grooming',
            additionalServices: appointment.additional_services || [],
            basePrice: appointment.base_price || 0,
            mattedCoatFee: appointment.matted_coat_fee || 0
          };

          console.log('📧 Sending payment confirmation to:', paymentDetails.userEmail);

          // Send confirmation email to customer
          await emailService.sendPaymentConfirmationEmail(paymentDetails);
          console.log(`📧 Payment confirmation email sent to ${req.user.email}`);

          // Send notification email to admin
          await emailService.sendAdminPaymentNotification(paymentDetails);
          console.log(`📧 Admin notification sent for payment ${paymentId}`);

        } catch (emailError) {
          console.error('❌ Error sending payment confirmation emails:', emailError);
          // Don't fail the payment process if email fails
        }
        
      } catch (error) {
        console.error('❌ Error in mock payment completion:', error);
      }
    }, 8000); // 8 seconds delay

    res.status(201).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        payment_id: paymentId,
        gcash_payment_url: gcashPayment.paymentUrl,
        gcash_reference: gcashPayment.referenceNumber,
        amount: appointment.total_amount,
        currency: 'PHP',
        expires_at: gcashPayment.expiresAt,
        mock_mode: true,
        estimated_completion: '8 seconds' // For testing purposes
      }
    });

  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  }
};

// MOCK GCASH PAYMENT INITIALIZATION
async function initializeGCashPayment(paymentDetails) {
  const transactionId = `GCASH_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  const referenceNumber = `REF${Date.now()}`;
  const expiresAt = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes from now
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock GCash payment URL
  const paymentUrl = `https://mock-gcash-portal.com/payment?ref=${referenceNumber}&amount=${paymentDetails.amount}&merchant=${GCASH_CONFIG.merchantId}`;
  
  console.log('🎭 Mock GCash Payment Initialized:', {
    transactionId,
    referenceNumber,
    amount: paymentDetails.amount,
    description: paymentDetails.description,
    mockMode: true
  });
  
  return {
    transactionId,
    referenceNumber,
    paymentUrl,
    expiresAt: expiresAt.toISOString()
  };
}

// HANDLE GCASH WEBHOOK/CALLBACK
exports.handleGCashCallback = async (req, res) => {
  try {
    const { 
      transaction_id, 
      reference_number, 
      status, 
      amount,
      payment_date 
    } = req.body;

    console.log('🔔 GCash Callback received:', req.body);

    // Find payment record
    const payment = await Payment.findByGCashTransaction(transaction_id) ||
                   await Payment.findByReference(reference_number);

    if (!payment) {
      console.log('❌ Payment not found for callback:', { transaction_id, reference_number });
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Verify amount matches
    if (parseFloat(amount) !== parseFloat(payment.amount)) {
      console.log('❌ Amount mismatch:', { callbackAmount: amount, paymentAmount: payment.amount });
      return res.status(400).json({ success: false, message: 'Amount mismatch' });
    }

    // Determine status mapping
    let paymentStatus;
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'paid':
        paymentStatus = 'completed';
        break;
      case 'failed':
      case 'cancelled':
      case 'expired':
        paymentStatus = 'failed';
        break;
      default:
        paymentStatus = 'pending';
    }

    console.log(`🔄 Updating payment ${payment.id} status from ${payment.status} to ${paymentStatus}`);

    // Update payment record
    await Payment.update(payment.id, {
      status: paymentStatus,
      paid_at: paymentStatus === 'completed' ? new Date(payment_date || new Date()) : null,
      gcash_response: JSON.stringify(req.body)
    });

    // Sync appointment payment status
    await Appointment.syncPaymentStatusWithPayments(payment.appointment_id);

// 🔔 Notify owner about payment received
try {
  const [ownerRows] = await db.execute(`
    SELECT id FROM users WHERE role = 'owner' LIMIT 1
  `);

  if (ownerRows.length > 0) {
    const ownerId = ownerRows[0].id;

    await ownerNotificationHelper.sendPaymentReceivedNotification(ownerId, {
      amount: payment.amount,
      customerName: userDetails ? userDetails.name : 'Unknown Customer',
      petName: appointment ? appointment.pet.name : 'Unknown Pet'
    });

    console.log(`✅ Owner notified of webhook payment ${payment.id}`);
  }
} catch (notifyError) {
  console.error('❌ Error sending owner payment notification (webhook):', notifyError);
}


    // 📧 SEND EMAIL NOTIFICATIONS BASED ON STATUS
    if (paymentStatus === 'completed') {
      try {
        // Get appointment details for email
        const appointment = await Appointment.findByIdWithPetDetails(payment.appointment_id);
        const userDetails = await getUserById(payment.user_id); // You'll need to implement this
        
        if (appointment && userDetails) {
          const paymentDetails = {
            userEmail: userDetails.email,
            userName: userDetails.name,
            paymentId: payment.id,
            amount: payment.amount,
            referenceNumber: reference_number,
            paidAt: new Date(payment_date || new Date()),
            appointmentId: appointment.id,
            appointmentDate: appointment.preferred_date,
            appointmentTime: appointment.preferred_time,
            petName: appointment.pet.name,
            serviceName: appointment.service_name,
            serviceCategory: appointment.service_category || 'Grooming'
          };

          // Send confirmation email to customer
          await emailService.sendPaymentConfirmationEmail(paymentDetails);
          console.log(`📧 Webhook: Payment confirmation email sent to ${userDetails.email}`);

          // Send notification email to admin
          await emailService.sendAdminPaymentNotification(paymentDetails);
          console.log(`📧 Webhook: Admin notification sent for payment ${payment.id}`);
        }
      } catch (emailError) {
        console.error('❌ Error sending webhook payment emails:', emailError);
      }
    } else if (paymentStatus === 'failed') {
      try {
        // Send payment failed email
        const appointment = await Appointment.findByIdWithPetDetails(payment.appointment_id);
        const userDetails = await getUserById(payment.user_id);
        
        if (appointment && userDetails) {
          const paymentDetails = {
            userEmail: userDetails.email,
            userName: userDetails.name,
            amount: payment.amount,
            referenceNumber: reference_number,
            petName: appointment.pet.name,
            serviceName: appointment.service_name
          };

          await emailService.sendPaymentFailedEmail(paymentDetails);
          console.log(`📧 Payment failed email sent to ${userDetails.email}`);
        }
      } catch (emailError) {
        console.error('❌ Error sending payment failed email:', emailError);
      }
    }

    console.log(`✅ Payment ${payment.id} updated successfully`);
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error handling GCash callback:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to get user details (you'll need to implement this based on your User model)// Helper function to get user details - FIXED VERSION
async function getUserById(userId) {
  try {
    const db = require('../models/db'); // Adjust path as needed
    
    const sql = `SELECT id, name, email FROM users WHERE id = ?`;
    const [rows] = await db.query(sql, [userId]);
    
    if (rows.length === 0) {
      console.error(`❌ User not found for ID: ${userId}`);
      return null;
    }
    
    const user = rows[0];
    console.log(`📋 Found user: ${user.email} (${user.name})`);
    
    return user;
  } catch (error) {
    console.error('❌ Error fetching user details:', error);
    return null;
  }
}

// CHECK PAYMENT STATUS
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await Payment.findByIdWithDetails(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Verify ownership
    if (payment.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    console.log(`🔍 Checking payment status for payment ${paymentId}: ${payment.status}`);

    // Store previous status for email comparison
    const previousStatus = payment.status;

    // For pending payments, check with mock GCash
    if (payment.status === 'pending' && payment.gcash_transaction_id) {
      console.log('📡 Checking with mock GCash service...');
      
      const gcashStatus = await checkGCashPaymentStatus(payment.gcash_transaction_id);
      
      if (gcashStatus.status !== payment.status) {
        console.log(`🔄 Updating payment status from ${payment.status} to ${gcashStatus.status}`);
        
        await Payment.update(paymentId, {
          status: gcashStatus.status,
          paid_at: gcashStatus.status === 'completed' ? new Date() : null,
          gcash_response: JSON.stringify({
            ...gcashStatus,
            updated_via_status_check: true,
            checked_at: new Date().toISOString()
          })
        });
        
        // Sync appointment status
        await Appointment.syncPaymentStatusWithPayments(payment.appointment_id);

        // 📧 SEND EMAIL IF STATUS CHANGED TO COMPLETED
        if (gcashStatus.status === 'completed' && previousStatus !== 'completed') {
          try {
            const appointment = await Appointment.findByIdWithPetDetails(payment.appointment_id);
            
            if (appointment) {
              const paymentDetails = {
                userEmail: req.user.email,
                userName: req.user.name,
                paymentId: paymentId,
                amount: payment.amount,
                referenceNumber: payment.external_reference,
                paidAt: new Date(),
                appointmentId: appointment.id,
                appointmentDate: appointment.preferred_date,
                appointmentTime: appointment.preferred_time,
                petName: appointment.pet.name,
                serviceName: appointment.service_name,
                serviceCategory: appointment.service_category || 'Grooming'
              };

              // Send confirmation email to customer
              await emailService.sendPaymentConfirmationEmail(paymentDetails);
              console.log(`📧 Status check: Payment confirmation email sent to ${req.user.email}`);

              // Send notification email to admin
              await emailService.sendAdminPaymentNotification(paymentDetails);
              console.log(`📧 Status check: Admin notification sent for payment ${paymentId}`);
            }
          } catch (emailError) {
            console.error('❌ Error sending status check emails:', emailError);
          }
        }
      }
    }

    // Get updated payment details
    const updatedPayment = await Payment.findByIdWithDetails(paymentId);
    
    console.log(`📋 Returning payment status: ${updatedPayment.status}`);
    
    res.status(200).json({
      success: true,
      data: {
        ...updatedPayment,
        mock_mode: true // Indicate this is mock mode
      }
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// MOCK GCASH STATUS CHECK - Enhanced to return completion after time
async function checkGCashPaymentStatus(transactionId) {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log(`🎭 Mock: Checking GCash status for transaction ${transactionId}`);
  
  // Extract timestamp from transaction ID to determine if enough time has passed
  const timestampMatch = transactionId.match(/GCASH_(\d+)_/);
  if (timestampMatch) {
    const createdTime = parseInt(timestampMatch[1]);
    const currentTime = Date.now();
    const timeElapsed = currentTime - createdTime;
    
    // If more than 8 seconds have passed, mark as completed (mock successful payment)
    if (timeElapsed > 8000) {
      console.log(`✅ Mock: Payment completed after ${Math.round(timeElapsed/1000)} seconds`);
      return {
        transactionId,
        status: 'completed',
        updatedAt: new Date().toISOString(),
        mockTimeElapsed: Math.round(timeElapsed/1000)
      };
    } else {
      console.log(`⏳ Mock: Payment still processing (${Math.round(timeElapsed/1000)}s elapsed)`);
      return {
        transactionId,
        status: 'pending',
        updatedAt: new Date().toISOString(),
        mockTimeElapsed: Math.round(timeElapsed/1000)
      };
    }
  }
  
  // Fallback to random status if timestamp extraction fails
  const mockStatuses = ['pending', 'completed'];
  const randomStatus = mockStatuses[Math.floor(Math.random() * mockStatuses.length)];
  
  return {
    transactionId,
    status: randomStatus,
    updatedAt: new Date().toISOString(),
    mockFallback: true
  };
}

// GET PAYMENT HISTORY FOR USER
exports.getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.findByUserWithDetails(req.user.id);

    res.status(200).json({
      success: true,
      data: payments,
      mock_mode: true
    });

  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment history',
      error: error.message
    });
  }
};

// CANCEL PAYMENT
exports.cancelPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verify payment belongs to user
    if (payment.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only pending payments can be cancelled
    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel ${payment.status} payment`
      });
    }

    console.log(`🚫 Cancelling payment ${paymentId}`);

    // Update payment status
    await Payment.update(paymentId, {
      status: 'cancelled',
      cancelled_at: new Date(),
      gcash_response: JSON.stringify({
        cancelled_by_user: true,
        cancelled_at: new Date().toISOString(),
        mock_cancellation: true
      })
    });

    // Sync appointment payment status
    await Appointment.syncPaymentStatusWithPayments(payment.appointment_id);

    console.log(`✅ Payment ${paymentId} cancelled successfully`);

    res.status(200).json({
      success: true,
      message: 'Payment cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling payment',
      error: error.message
    });
  }
};

// 🎭 MOCK ENDPOINTS FOR TESTING

// Manual complete payment (for testing)
exports.mockCompletePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot complete ${payment.status} payment` 
      });
    }

    console.log(`🎭 Manually completing mock payment ${paymentId}`);

    await Payment.update(paymentId, {
      status: 'completed',
      paid_at: new Date(),
      gcash_response: JSON.stringify({
        manual_completion: true,
        completed_at: new Date().toISOString(),
        mock_mode: true
      })
    });

    await Appointment.syncPaymentStatusWithPayments(payment.appointment_id);

    // 📧 SEND EMAIL NOTIFICATIONS FOR MANUAL COMPLETION
    try {
      const appointment = await Appointment.findByIdWithPetDetails(payment.appointment_id);
      const userDetails = await getUserById(payment.user_id);
      
      if (appointment && userDetails) {
        const paymentDetails = {
          userEmail: userDetails.email,
          userName: userDetails.name,
          paymentId: paymentId,
          amount: payment.amount,
          referenceNumber: payment.external_reference,
          paidAt: new Date(),
          appointmentId: appointment.id,
          appointmentDate: appointment.preferred_date,
          appointmentTime: appointment.preferred_time,
          petName: appointment.pet.name,
          serviceName: appointment.service_name,
          serviceCategory: appointment.service_category || 'Grooming'
        };

        // Send confirmation email to customer
        await emailService.sendPaymentConfirmationEmail(paymentDetails);
        console.log(`📧 Manual completion: Email sent to ${userDetails.email}`);

        // Send notification email to admin
        await emailService.sendAdminPaymentNotification(paymentDetails);
        console.log(`📧 Manual completion: Admin notification sent`);
      }
    } catch (emailError) {
      console.error('❌ Error sending manual completion emails:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment manually completed (mock)',
      data: { payment_id: paymentId }
    });

  } catch (error) {
    console.error('Error manually completing payment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Manual fail payment (for testing)
exports.mockFailPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot fail ${payment.status} payment` 
      });
    }

    console.log(`🎭 Manually failing mock payment ${paymentId}`);

    await Payment.update(paymentId, {
      status: 'failed',
      gcash_response: JSON.stringify({
        manual_failure: true,
        failed_at: new Date().toISOString(),
        mock_mode: true
      })
    });

    await Appointment.syncPaymentStatusWithPayments(payment.appointment_id);

    // 📧 SEND FAILURE EMAIL NOTIFICATION
    try {
      const appointment = await Appointment.findByIdWithPetDetails(payment.appointment_id);
      const userDetails = await getUserById(payment.user_id);
      
      if (appointment && userDetails) {
        const paymentDetails = {
          userEmail: userDetails.email,
          userName: userDetails.name,
          amount: payment.amount,
          referenceNumber: payment.external_reference,
          petName: appointment.pet.name,
          serviceName: appointment.service_name
        };

        await emailService.sendPaymentFailedEmail(paymentDetails);
        console.log(`📧 Payment failed email sent to ${userDetails.email}`);
      }
    } catch (emailError) {
      console.error('❌ Error sending payment failed email:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment manually failed (mock)',
      data: { payment_id: paymentId }
    });

  } catch (error) {
    console.error('Error manually failing payment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};