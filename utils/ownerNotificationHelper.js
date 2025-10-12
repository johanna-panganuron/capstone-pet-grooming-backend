// utils/ownerNotificationHelper.js
const { sendNotificationToUser } = require('../socketServer');
const Notification = require('../models/Notification');

class OwnerNotificationHelper {
  // Send daily/weekly revenue report
  async sendRevenueReport(ownerId, reportData) {
    const title = 'Revenue Report';
    const message = `Today's revenue: ₱${reportData.todayRevenue}. Total this week: ₱${reportData.weeklyRevenue}. ${reportData.appointmentsCount} appointments completed.`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'revenue'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'revenue',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send new appointment notification to owner
  async sendNewAppointmentNotification(ownerId, appointmentData) {
    const title = 'New Appointment Booked';
    const message = `${appointmentData.customerName} booked an appointment for ${appointmentData.petName} on ${appointmentData.date} at ${appointmentData.time}.`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'appointment'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'appointment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send payment received notification to owner
  async sendPaymentReceivedNotification(ownerId, paymentData) {
    const title = 'Payment Received';
    const message = `Payment of ₱${paymentData.amount} received from ${paymentData.customerName} for ${paymentData.petName}'s appointment.`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'payment'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'payment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send low inventory alert
  async sendLowInventoryAlert(ownerId, inventoryData) {
    const title = 'Low Inventory Alert';
    const message = `${inventoryData.itemName} is running low. Only ${inventoryData.quantity} units remaining.`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'system'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'system',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send staff activity notification
  async sendStaffActivityNotification(ownerId, activityData) {
    const title = 'Staff Activity';
    const message = `${activityData.staffName} ${activityData.action} - ${activityData.details}`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'staff'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'staff',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send shop settings update notification
  async sendShopSettingsUpdateNotification(ownerId, updateData) {
    const title = 'Shop Settings Updated';
    const message = `Your shop settings have been updated: ${updateData.changes}`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'shop'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'shop',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send system maintenance notification
  async sendMaintenanceNotification(ownerId, maintenanceData) {
    const title = 'System Maintenance';
    const message = `Scheduled maintenance: ${maintenanceData.description} on ${maintenanceData.date} from ${maintenanceData.startTime} to ${maintenanceData.endTime}.`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'system'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'system',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send appointment reschedule notification to owner
  async sendAppointmentRescheduleNotification(ownerId, rescheduleData) {
    const title = 'Appointment Rescheduled';
    const message = `${rescheduleData.customerName} rescheduled their appointment for ${rescheduleData.petName} from ${rescheduleData.oldDate} at ${rescheduleData.oldTime} to ${rescheduleData.newDate} at ${rescheduleData.newTime}. Reason: ${rescheduleData.reason}`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'appointment'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'appointment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }

  // Send appointment cancelled notification to owner
  async sendAppointmentCancelledNotification(ownerId, cancellationData) {
    const title = 'Appointment Cancelled';
    const message = `${cancellationData.customerName} cancelled their appointment for ${cancellationData.petName} (${cancellationData.serviceName}) scheduled for ${cancellationData.date} at ${cancellationData.time}.`;
    
    const dbNotification = await Notification.create(
      ownerId, 
      title, 
      message, 
      'appointment'
    );
    
    sendNotificationToUser(ownerId, {
      id: dbNotification.id,
      title,
      message,
      type: 'appointment',
      is_read: false,
      created_at: new Date()
    });
    
    return dbNotification;
  }
}

module.exports = new OwnerNotificationHelper();