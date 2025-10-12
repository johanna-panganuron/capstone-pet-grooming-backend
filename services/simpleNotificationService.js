// services/simpleNotificationService.js
const Notification = require('../models/Notification');

class SimpleNotificationService {
  // Send appointment notification
  async sendAppointmentNotification(userId, type, data) {
    let title, message;
    
    switch (type) {
      case 'confirmed':
        title = 'Appointment Confirmed';
        message = `Your appointment for ${data.petName} on ${data.date} at ${data.time} has been confirmed.`;
        break;
      case 'cancelled':
        title = 'Appointment Cancelled';
        message = `Your appointment for ${data.petName} on ${data.date} has been cancelled.`;
        break;
      case 'rescheduled':
        title = 'Appointment Rescheduled';
        message = `Your appointment for ${data.petName} has been moved to ${data.newDate} at ${data.newTime}.`;
        break;
      case 'completed':
        title = 'Service Completed';
        message = `${data.petName}'s grooming service has been completed. Thank you!`;
        break;
      default:
        title = 'Appointment Update';
        message = `Your appointment for ${data.petName} has been updated.`;
    }
    
    return await Notification.create(userId, title, message, 'appointment');
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
    
    return await Notification.create(userId, title, message, 'payment');
  }

  // Send walk-in notification
  async sendWalkInNotification(userId, type, data) {
    let title, message;
    
    switch (type) {
      case 'ready':
        title = 'Your Pet is Ready!';
        message = `${data.petName} is ready for pickup! Queue #${data.queueNumber}`;
        break;
      case 'completed':
        title = 'Service Completed';
        message = `${data.petName}'s grooming service has been completed. Total: ₱${data.amount}`;
        break;
      default:
        title = 'Walk-in Update';
        message = `Update for ${data.petName}'s walk-in service.`;
    }
    
    return await Notification.create(userId, title, message, 'appointment');
  }

  // Send system notification
  async sendSystemNotification(userIds, title, message) {
    const promises = userIds.map(userId => 
      Notification.create(userId, title, message, 'system')
    );
    
    return await Promise.all(promises);
  }

  // Send general notification
  async sendGeneralNotification(userId, title, message) {
    return await Notification.create(userId, title, message, 'general');
  }
}

module.exports = new SimpleNotificationService();