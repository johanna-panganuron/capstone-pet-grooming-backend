// utils/notificationHelper.js
const { sendNotificationToUser} = require('../socketServer');
const Notification = require('../models/Notification');

class NotificationHelper {
  // Send appointment confirmation
  async sendAppointmentConfirmation(userId, appointmentData) {
    const title = 'Appointment Confirmed';
    const message = `Your appointment for ${appointmentData.petName} on ${appointmentData.date} at ${appointmentData.time} has been confirmed.`;
    
    // Save to database
    const dbNotification = await Notification.create(
      userId, 
      title, 
      message, 
      'appointment'
    );
    
    // Send real-time notification
    sendNotificationToUser(userId, {
      id: dbNotification.id,
      title,
      message,
      type: 'appointment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send appointment status update
  async sendAppointmentStatusUpdate(userId, appointmentData, newStatus) {
    const statusMessages = {
      'confirmed': 'has been confirmed',
      'cancelled': 'has been cancelled',
      'completed': 'has been completed',
      'in_progress': 'is now in progress',
      'waiting': 'is now waiting'
    };
    
    const title = `Appointment ${newStatus.replace('_', ' ').toUpperCase()}`;
    const message = `Your appointment for ${appointmentData.petName} ${statusMessages[newStatus] || 'has been updated'}.`;
    
    // Save to database
    const dbNotification = await Notification.create(
      userId, 
      title, 
      message, 
      'appointment'
    );
    
    // Send real-time notification
    sendNotificationToUser(userId, {
      id: dbNotification.id,
      title,
      message,
      type: 'appointment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send payment notification
  async sendPaymentNotification(userId, type, data) {
    let title, message;
    
    switch (type) {
      case 'success':
        title = 'Payment Received';
        message = `We have received your payment of ₱${data.amount} for ${data.petName}'s appointment. Thank you!`;
        break;
      case 'failed':
        title = 'Payment Failed';
        message = `Your payment of ₱${data.amount} could not be processed. Please try again.`;
        break;
      default:
        title = 'Payment Update';
        message = `Payment update for ${data.petName}'s appointment.`;
    }
    
    // Save to database
    const dbNotification = await Notification.create(
      userId, 
      title, 
      message, 
      'payment'
    );
    
    // Send real-time notification
    sendNotificationToUser(userId, {
      id: dbNotification.id,
      title,
      message,
      type: 'payment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }
}

module.exports = new NotificationHelper();