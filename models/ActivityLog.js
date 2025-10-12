// models/ActivityLog.js - Fixed version using existing tables
const db = require('./db');

class ActivityLog {
  
  // Get all activities from existing tables with proper user tracking// In your ActivityLog.js model, update the findAll method return:

static async findAll(filters = {}) {
  try {
    console.log('ActivityLog.findAll called with filters:', filters);

    // Build the unified query from existing tables
    const activities = await this.getUnifiedActivities(filters);
    
    // Apply additional filters
    let filteredActivities = this.applyFilters(activities, filters);
    
    // Sort by date (newest first)
    filteredActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Apply pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10; // Changed default from 20 to 10 to match your Vue component
    const offset = (page - 1) * limit;
    
    const total = filteredActivities.length;
    const paginatedActivities = filteredActivities.slice(offset, offset + limit);

    console.log(`Pagination: page=${page}, limit=${limit}, total=${total}, total_pages=${Math.ceil(total / limit)}`);

    return {
      data: paginatedActivities,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total / limit),
        total_items: total,                    // ✅ Fixed property name
        items_per_page: limit,                 // ✅ Fixed property name
        has_next: page < Math.ceil(total / limit),
        has_prev: page > 1
      }
    };

  } catch (error) {
    console.error('Error in ActivityLog.findAll:', error);
    throw error;
  }
}

  // Get unified activities from all tables
  static async getUnifiedActivities(filters = {}) {
    const activities = [];
    
    try {
      // Get real-time activities from log files (most accurate)
      const loggedActivities = await this.getRecentActivitiesFromLogs();
      activities.push(...loggedActivities);
      
      // Get user registration activities
      const userActivities = await this.getUserActivities(filters);
      activities.push(...userActivities);
      
      // Get appointment activities
      const appointmentActivities = await this.getAppointmentActivities(filters);
      activities.push(...appointmentActivities);
      
      // Get walk-in activities  
      const walkInActivities = await this.getWalkInActivities(filters);
      activities.push(...walkInActivities);
      
      // Get pet activities
      const petActivities = await this.getPetActivities(filters);
      activities.push(...petActivities);
      
      // Get service activities
      const serviceActivities = await this.getServiceActivities(filters);
      activities.push(...serviceActivities);
      
      // Get payment activities
      const paymentActivities = await this.getPaymentActivities(filters);
      activities.push(...paymentActivities);

      // Get gallery activities
      const galleryActivities = await this.getGalleryActivities(filters);
      activities.push(...galleryActivities);

      // Get FAQ activities
      const faqActivities = await this.getFAQActivities(filters);
      activities.push(...faqActivities);

    } catch (error) {
      console.error('Error getting unified activities:', error);
    }
    
    return activities;
  }

  // Get recent activities from log files (most accurate source)
  static async getRecentActivitiesFromLogs() {
    const activities = [];
    
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const logDir = path.join(process.cwd(), 'logs');
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Read recent log files
      for (const date of [today, yesterday]) {
        try {
          const logFile = path.join(logDir, `activities-${date}.log`);
          const logData = await fs.readFile(logFile, 'utf8');
          const lines = logData.trim().split('\n').filter(line => line);
          
          for (const line of lines) {
            const activity = JSON.parse(line);
            activities.push({
              id: `log_${activity.timestamp.replace(/[^\w]/g, '_')}_${activity.user_id}`,
              user_name: activity.user_name, // ✅ Real user name from logged activity!
              user_role: activity.user_role,
              action: activity.action,
              target_type: activity.target_type,
              target_name: activity.target_name,
              details: activity.details,
              created_at: activity.timestamp,
              ip_address: activity.ip_address
            });
          }
        } catch (error) {
          // Log file doesn't exist, skip
          continue;
        }
      }
    } catch (error) {
      console.error('Error reading activity logs:', error);
    }
    
    return activities;
  }

  // Get user activities (registrations, profile updates)
  static async getUserActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT id, name, email, role, created_at, updated_at
        FROM users 
        WHERE 1=1 ${dateFilter}
        ORDER BY created_at DESC
        LIMIT 1000
      `;

      const [users] = await db.query(query, params);

      users.forEach(user => {
        // User registration
        activities.push({
          id: `user_register_${user.id}`,
          user_name: user.name,
          user_role: user.role,
          action: 'user_register',
          target_type: 'user',
          target_name: user.name,
          details: `New ${user.role} registered with email: ${user.email}`,
          created_at: user.created_at,
          ip_address: null
        });

        // If updated_at is different from created_at, it means profile was updated
        if (user.updated_at && new Date(user.updated_at).getTime() !== new Date(user.created_at).getTime()) {
          activities.push({
            id: `user_update_${user.id}`,
            user_name: user.name,
            user_role: user.role,
            action: 'user_update',
            target_type: 'user',
            target_name: user.name,
            details: `Profile updated`,
            created_at: user.updated_at,
            ip_address: null
          });
        }
      });

    } catch (error) {
      console.error('Error getting user activities:', error);
    }

    return activities;
  }

  // Get appointment activities with proper user tracking
  static async getAppointmentActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(a.created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(a.created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT 
          a.id,
          a.created_at,
          a.updated_at,
          a.status,
          a.preferred_date,
          a.preferred_time,
          a.total_amount,
          a.payment_status,
          a.cancelled_by_user_id,
          a.cancelled_reason,
          a.cancelled_at,
          u.name as owner_name,
          u.role as owner_role,
          p.name as pet_name,
          gs.name as service_name,
          groomer.name as groomer_name,
          groomer.staff_type as groomer_staff_type,
          cancelled_by.name as cancelled_by_name,
          cancelled_by.role as cancelled_by_role
        FROM appointments a
        JOIN users u ON a.owner_id = u.id
        JOIN pets p ON a.pet_id = p.id
        JOIN grooming_services gs ON a.service_id = gs.id
        LEFT JOIN users groomer ON a.groomer_id = groomer.id
        LEFT JOIN users cancelled_by ON a.cancelled_by_user_id = cancelled_by.id
        WHERE 1=1 ${dateFilter}
        ORDER BY a.created_at DESC
        LIMIT 1000
      `;

      const [appointments] = await db.query(query, params);

      appointments.forEach(apt => {
        // Appointment booked
        activities.push({
          id: `apt_book_${apt.id}`,
          user_name: apt.owner_name,
          user_role: apt.owner_role,
          action: 'appointment_book',
          target_type: 'appointment',
          target_name: `${apt.pet_name} - ${apt.service_name}`,
          details: `Booked ${apt.service_name} for ${apt.pet_name} on ${apt.preferred_date} at ${apt.preferred_time}. Amount: ₱${apt.total_amount}`,
          created_at: apt.created_at,
          ip_address: null
        });

        // Appointment status changes
        if (apt.status === 'completed') {
          // Only receptionist can mark as completed since groomers don't have accounts
          const completedByUser = apt.groomer_staff_type === 'Receptionist' ? apt.groomer_name : 'Receptionist';
          activities.push({
            id: `apt_complete_${apt.id}`,
            user_name: completedByUser,
            user_role: 'staff',
            action: 'appointment_complete',
            target_type: 'appointment',
            target_name: `${apt.pet_name} - ${apt.service_name}`,
            details: `Marked appointment as completed for ${apt.pet_name}. Amount: ₱${apt.total_amount}`,
            created_at: apt.updated_at,
            ip_address: null
          });
        }

        if (apt.status === 'cancelled' && apt.cancelled_at) {
          activities.push({
            id: `apt_cancel_${apt.id}`,
            user_name: apt.cancelled_by_name || apt.owner_name,
            user_role: apt.cancelled_by_role || apt.owner_role,
            action: 'appointment_cancel',
            target_type: 'appointment',
            target_name: `${apt.pet_name} - ${apt.service_name}`,
            details: `Cancelled appointment: ${apt.cancelled_reason || 'No reason provided'}`,
            created_at: apt.cancelled_at,
            ip_address: null
          });
        }
      });

    } catch (error) {
      console.error('Error getting appointment activities:', error);
    }

    return activities;
  }

  // Get walk-in activities
  static async getWalkInActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(w.created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(w.created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT 
          w.id,
          w.created_at,
          w.updated_at,
          w.status,
          w.queue_number,
          w.total_amount,
          w.cancelled_by,
          w.cancellation_reason,
          u.name as customer_name,
          u.role as customer_role,
          p.name as pet_name,
          gs.name as service_name
        FROM walk_in_bookings w
        JOIN users u ON w.owner_id = u.id
        JOIN pets p ON w.pet_id = p.id
        JOIN grooming_services gs ON w.service_id = gs.id
        WHERE 1=1 ${dateFilter}
        ORDER BY w.created_at DESC
        LIMIT 1000
      `;

      const [walkIns] = await db.query(query, params);

      walkIns.forEach(wi => {
        // Walk-in created - We need to determine which staff member actually created it
        // Since we don't have this info in the current table, we'll show "Staff Member" for now
        // But we'll add a note that this needs real-time logging to be accurate
        activities.push({
          id: `wi_create_${wi.id}`,
          user_name: 'Staff Member', // TODO: Track actual staff who created the walk-in
          user_role: 'staff',
          action: 'walk_in_create',
          target_type: 'walk_in',
          target_name: `Queue #${wi.queue_number} - ${wi.pet_name}`,
          details: `Created walk-in for ${wi.customer_name}'s ${wi.pet_name} - ${wi.service_name}. Amount: ₱${wi.total_amount}`,
          created_at: wi.created_at,
          ip_address: null
        });

        // Walk-in completed
        if (wi.status === 'completed') {
          activities.push({
            id: `wi_complete_${wi.id}`,
            user_name: 'Staff Member', // TODO: Track which staff member marked it complete
            user_role: 'staff',
            action: 'walk_in_complete',
            target_type: 'walk_in',
            target_name: `Queue #${wi.queue_number} - ${wi.pet_name}`,
            details: `Marked ${wi.service_name} as completed for ${wi.pet_name}. Amount: ₱${wi.total_amount}`,
            created_at: wi.updated_at,
            ip_address: null
          });
        }

        // Walk-in cancelled
        if (wi.status === 'cancelled') {
          const cancelledBy = wi.cancelled_by || 'staff';
          activities.push({
            id: `wi_cancel_${wi.id}`,
            user_name: cancelledBy === 'customer' ? wi.customer_name : 'Staff Member',
            user_role: cancelledBy === 'customer' ? wi.customer_role : 'staff',
            action: 'walk_in_cancel',
            target_type: 'walk_in',
            target_name: `Queue #${wi.queue_number} - ${wi.pet_name}`,
            details: `Cancelled by ${cancelledBy}: ${wi.cancellation_reason || 'No reason provided'}`,
            created_at: wi.updated_at,
            ip_address: null
          });
        }
      });

    } catch (error) {
      console.error('Error getting walk-in activities:', error);
    }

    return activities;
  }

  // Get pet activities
  static async getPetActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(p.created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(p.created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT 
          p.id, p.name as pet_name, p.type, p.breed, p.created_at, p.updated_at,
          u.name as owner_name, u.role as owner_role
        FROM pets p
        JOIN users u ON p.user_id = u.id
        WHERE 1=1 ${dateFilter}
        ORDER BY p.created_at DESC
        LIMIT 1000
      `;

      const [pets] = await db.query(query, params);

      pets.forEach(pet => {
        // Pet added
        activities.push({
          id: `pet_add_${pet.id}`,
          user_name: pet.owner_name,
          user_role: pet.owner_role,
          action: 'pet_create',
          target_type: 'pet',
          target_name: pet.pet_name,
          details: `Added new pet: ${pet.pet_name} (${pet.type}${pet.breed ? `, ${pet.breed}` : ''})`,
          created_at: pet.created_at,
          ip_address: null
        });

        // Pet updated (if updated_at is different from created_at)
        if (pet.updated_at && new Date(pet.updated_at).getTime() !== new Date(pet.created_at).getTime()) {
          activities.push({
            id: `pet_update_${pet.id}`,
            user_name: pet.owner_name,
            user_role: pet.owner_role,
            action: 'pet_update',
            target_type: 'pet',
            target_name: pet.pet_name,
            details: `Updated pet information for ${pet.pet_name}`,
            created_at: pet.updated_at,
            ip_address: null
          });
        }
      });

    } catch (error) {
      console.error('Error getting pet activities:', error);
    }

    return activities;
  }

  // Get service activities (only owner can create/update services)
  static async getServiceActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT id, name, price_small, status, created_at, updated_at
        FROM grooming_services 
        WHERE 1=1 ${dateFilter}
        ORDER BY created_at DESC
        LIMIT 1000
      `;

      const [services] = await db.query(query, params);

      services.forEach(service => {
        // Service created - This would be done by owner
        activities.push({
          id: `service_create_${service.id}`,
          user_name: 'Owner', // Only owner creates services
          user_role: 'owner',
          action: 'service_create',
          target_type: 'service',
          target_name: service.name,
          details: `Created new service: ${service.name} (Starting at ₱${service.price_small})`,
          created_at: service.created_at,
          ip_address: null
        });

        // Service updated
        if (service.updated_at && new Date(service.updated_at).getTime() !== new Date(service.created_at).getTime()) {
          activities.push({
            id: `service_update_${service.id}`,
            user_name: 'Owner',
            user_role: 'owner',
            action: 'service_update',
            target_type: 'service',
            target_name: service.name,
            details: `Updated service: ${service.name}`,
            created_at: service.updated_at,
            ip_address: null
          });
        }
      });

    } catch (error) {
      console.error('Error getting service activities:', error);
    }

    return activities;
  }

  // Get payment activities
  static async getPaymentActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(p.created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(p.created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT 
          p.id, p.amount, p.payment_method, p.status, p.created_at,
          u.name as user_name, u.role as user_role,
          a.id as appointment_id
        FROM payments p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN appointments a ON p.appointment_id = a.id
        WHERE p.status = 'completed' ${dateFilter}
        ORDER BY p.created_at DESC
        LIMIT 1000
      `;

      const [payments] = await db.query(query, params);

      payments.forEach(payment => {
        activities.push({
          id: `payment_${payment.id}`,
          user_name: payment.user_name,
          user_role: payment.user_role,
          action: 'payment_complete',
          target_type: 'payment',
          target_name: payment.appointment_id ? `Appointment Payment #${payment.appointment_id}` : `Payment #${payment.id}`,
          details: `Completed ${payment.payment_method} payment of ₱${payment.amount}`,
          created_at: payment.created_at,
          ip_address: null
        });
      });

    } catch (error) {
      console.error('Error getting payment activities:', error);
    }

    return activities;
  }

  // Get gallery activities (owner uploads)
  static async getGalleryActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT id, image_url, created_at
        FROM gallery 
        WHERE 1=1 ${dateFilter}
        ORDER BY created_at DESC
        LIMIT 500
      `;

      const [gallery] = await db.query(query, params);

      gallery.forEach(item => {
        activities.push({
          id: `gallery_upload_${item.id}`,
          user_name: 'Owner', // Only owner manages gallery
          user_role: 'owner',
          action: 'gallery_upload',
          target_type: 'gallery',
          target_name: `Image #${item.id}`,
          details: `Uploaded new gallery image`,
          created_at: item.created_at,
          ip_address: null
        });
      });

    } catch (error) {
      console.error('Error getting gallery activities:', error);
    }

    return activities;
  }

  // Get FAQ activities (owner manages)
  static async getFAQActivities(filters) {
    const activities = [];
    
    try {
      let dateFilter = '';
      const params = [];
      
      if (filters.date_from) {
        dateFilter += ' AND DATE(created_at) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        dateFilter += ' AND DATE(created_at) <= ?';
        params.push(filters.date_to);
      }

      const query = `
        SELECT id, question, created_at, updated_at
        FROM faqs 
        WHERE 1=1 ${dateFilter}
        ORDER BY created_at DESC
        LIMIT 500
      `;

      const [faqs] = await db.query(query, params);

      faqs.forEach(faq => {
        // FAQ created
        activities.push({
          id: `faq_create_${faq.id}`,
          user_name: 'Owner',
          user_role: 'owner',
          action: 'faq_create',
          target_type: 'faq',
          target_name: `FAQ #${faq.id}`,
          details: `Added new FAQ: ${faq.question.substring(0, 50)}...`,
          created_at: faq.created_at,
          ip_address: null
        });

        // FAQ updated
        if (faq.updated_at && new Date(faq.updated_at).getTime() !== new Date(faq.created_at).getTime()) {
          activities.push({
            id: `faq_update_${faq.id}`,
            user_name: 'Owner',
            user_role: 'owner',
            action: 'faq_update',
            target_type: 'faq',
            target_name: `FAQ #${faq.id}`,
            details: `Updated FAQ: ${faq.question.substring(0, 50)}...`,
            created_at: faq.updated_at,
            ip_address: null
          });
        }
      });

    } catch (error) {
      console.error('Error getting FAQ activities:', error);
    }

    return activities;
  }

  // Apply filters to activities
  static applyFilters(activities, filters) {
    let filtered = activities;

    if (filters.user_role) {
      filtered = filtered.filter(activity => activity.user_role === filters.user_role);
    }

    if (filters.action) {
      filtered = filtered.filter(activity => activity.action === filters.action);
    }

    if (filters.target_type) {
      filtered = filtered.filter(activity => activity.target_type === filters.target_type);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(activity => 
        activity.user_name.toLowerCase().includes(searchTerm) ||
        activity.action.toLowerCase().includes(searchTerm) ||
        (activity.target_name && activity.target_name.toLowerCase().includes(searchTerm)) ||
        (activity.details && activity.details.toLowerCase().includes(searchTerm))
      );
    }

    return filtered;
  }

  // Get activity statistics
  static async getStats(filters = {}) {
    try {
      const activities = await this.getUnifiedActivities(filters);
      const filteredActivities = this.applyFilters(activities, filters);

      const now = new Date();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

      const recentActivities = filteredActivities.filter(activity => 
        new Date(activity.created_at) >= oneDayAgo
      );

      const roleStats = {};
      const actionStats = {};
      const targetTypeStats = {};

      filteredActivities.forEach(activity => {
        // Role stats
        roleStats[activity.user_role] = (roleStats[activity.user_role] || 0) + 1;
        
        // Action stats
        actionStats[activity.action] = (actionStats[activity.action] || 0) + 1;
        
        // Target type stats
        if (activity.target_type) {
          targetTypeStats[activity.target_type] = (targetTypeStats[activity.target_type] || 0) + 1;
        }
      });

      return {
        total: [{ count: filteredActivities.length }],
        recent: [{ count: recentActivities.length }],
        by_role: Object.entries(roleStats).map(([user_role, count]) => ({ user_role, count })),
        by_action: Object.entries(actionStats)
          .map(([action, count]) => ({ action, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        by_target_type: Object.entries(targetTypeStats).map(([target_type, count]) => ({ target_type, count }))
      };

    } catch (error) {
      console.error('Error in ActivityLog.getStats:', error);
      return {
        total: [{ count: 0 }],
        recent: [{ count: 0 }],
        by_role: [],
        by_action: [],
        by_target_type: []
      };
    }
  }

  // Get unique values for filters
  static async getFilterOptions() {
    try {
      const activities = await this.getUnifiedActivities();

      const roles = [...new Set(activities.map(a => a.user_role))];
      const actions = [...new Set(activities.map(a => a.action))];
      const targetTypes = [...new Set(activities.map(a => a.target_type).filter(Boolean))];

      return {
        roles: roles.map(role => ({ user_role: role })),
        actions: actions.map(action => ({ action })),
        target_types: targetTypes.map(target_type => ({ target_type }))
      };

    } catch (error) {
      console.error('Error in ActivityLog.getFilterOptions:', error);
      return {
        roles: [],
        actions: [],
        target_types: []
      };
    }
  }

  // Helper method to format dates
  static formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

module.exports = ActivityLog;