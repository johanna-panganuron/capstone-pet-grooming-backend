// models/GroomingService.js 
const db = require('./db');

class GroomingService {
  static async create(serviceData) {
    const requiredFields = [
      'name', 'description', 'image_url', 'price_xs', 'price_small',
      'price_medium', 'price_large', 'price_xl', 'price_xxl',
      'time_description', 'category'
    ];

    const missingFields = requiredFields.filter(field => !serviceData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const [result] = await db.execute(
      `INSERT INTO grooming_services 
      (name, description, image_url, price_xs, price_small, price_medium, 
       price_large, price_xl, price_xxl, time_description, status, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        serviceData.name, 
        serviceData.description, 
        serviceData.image_url,
        parseFloat(serviceData.price_xs),
        parseFloat(serviceData.price_small),
        parseFloat(serviceData.price_medium),
        parseFloat(serviceData.price_large),
        parseFloat(serviceData.price_xl),
        parseFloat(serviceData.price_xxl),
        serviceData.time_description,
        serviceData.status || 'available',
        serviceData.category
      ]
    );
    return result.insertId;
  }

  static async findAll(filters = {}) {
    try {
      let sql = `
        SELECT 
          id, name, description, category, image_url, 
          time_description, status,
          price_xs, price_small, price_medium, 
          price_large, price_xl, price_xxl,
          created_at, updated_at
        FROM grooming_services 
        WHERE 1=1
      `;
      
      const params = [];
      
      // Add status filter if provided
      if (filters.status) {
        sql += ` AND status = ?`;
        params.push(filters.status);
        console.log(`🔍 Filtering by status: ${filters.status}`);
      }
      
      // Add category filter if provided
      if (filters.category) {
        sql += ` AND category = ?`;
        params.push(filters.category);
      }
      
      // Add search filter if provided
      if (filters.search) {
        sql += ` AND (name LIKE ? OR description LIKE ?)`;
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
      }
      
      sql += ` ORDER BY category ASC, name ASC`;
      
      console.log('🔍 Executing SQL:', sql);
      console.log('📋 With params:', params);
      
      const [rows] = await db.execute(sql, params);
      
      console.log(`✅ GroomingService.findAll returned ${rows.length} services`);
      
      // Log status distribution for debugging
      const statusCounts = {};
      rows.forEach(service => {
        statusCounts[service.status] = (statusCounts[service.status] || 0) + 1;
      });
      console.log('📊 Status distribution:', statusCounts);
      
      return rows;
    } catch (error) {
      console.error('❌ Error in GroomingService.findAll:', error);
      throw error;
    }
  }

  static async findById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM grooming_services WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  static async findAvailable() {
    const [rows] = await db.execute(
      'SELECT * FROM grooming_services WHERE status = ? ORDER BY name ASC', 
      ['available']
    );
    return rows;
  }

  // New method: Find services by category (useful for staff)
  static async findByCategory(category) {
    const [rows] = await db.execute(
      'SELECT * FROM grooming_services WHERE category = ? ORDER BY name ASC',
      [category]
    );
    return rows;
  }

  // New method: Find services by status (useful for staff dashboard)
  static async findByStatus(status) {
    const [rows] = await db.execute(
      'SELECT * FROM grooming_services WHERE status = ? ORDER BY name ASC',
      [status]
    );
    return rows;
  }

  // New method: Get all unique categories (useful for staff filtering)
  static async getCategories() {
    const [rows] = await db.execute(
      'SELECT DISTINCT category FROM grooming_services ORDER BY category ASC'
    );
    return rows.map(row => row.category);
  }

  // Enhanced update method with better error handling
  static async update(id, serviceData) {
    // First check if service exists
    const existingService = await this.findById(id);
    if (!existingService) {
      throw new Error('Service not found');
    }

    const [result] = await db.execute(
      `UPDATE grooming_services SET 
        name = ?, 
        description = ?, 
        image_url = ?,
        price_xs = ?,
        price_small = ?,
        price_medium = ?,
        price_large = ?,
        price_xl = ?,
        price_xxl = ?,
        time_description = ?,
        status = ?,
        category = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        serviceData.name,
        serviceData.description,
        serviceData.image_url,
        parseFloat(serviceData.price_xs),
        parseFloat(serviceData.price_small),
        parseFloat(serviceData.price_medium),
        parseFloat(serviceData.price_large),
        parseFloat(serviceData.price_xl),
        parseFloat(serviceData.price_xxl),
        serviceData.time_description,
        serviceData.status || 'available',
        serviceData.category,
        id
      ]
    );

    if (result.affectedRows === 0) {
      throw new Error('No rows were updated');
    }

    return result.affectedRows;
  }

  // New method: Update only status (specifically for staff use)
  static async updateStatus(id, status) {
    // Validate status
    const validStatuses = ['available', 'unavailable'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // First check if service exists
    const existingService = await this.findById(id);
    if (!existingService) {
      throw new Error('Service not found');
    }

    const [result] = await db.execute(
      `UPDATE grooming_services SET 
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [status, id]
    );

    if (result.affectedRows === 0) {
      throw new Error('No rows were updated');
    }

    return {
      previousStatus: existingService.status,
      newStatus: status,
      affectedRows: result.affectedRows
    };
  }

  static async delete(id) {
    // First check if service exists
    const existingService = await this.findById(id);
    if (!existingService) {
      throw new Error('Service not found');
    }

    const [result] = await db.execute(
      'DELETE FROM grooming_services WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      throw new Error('No rows were deleted');
    }

    return result.affectedRows;
  }

  // New method: Get service statistics (useful for dashboards)
  static async getStats() {
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_services,
        COUNT(CASE WHEN status = 'available' THEN 1 END) as available_services,
        COUNT(CASE WHEN status = 'unavailable' THEN 1 END) as unavailable_services,
        COUNT(DISTINCT category) as total_categories,
        MIN(LEAST(price_xs, price_small, price_medium, price_large, price_xl, price_xxl)) as min_price,
        MAX(GREATEST(price_xs, price_small, price_medium, price_large, price_xl, price_xxl)) as max_price,
        AVG((price_xs + price_small + price_medium + price_large + price_xl + price_xxl) / 6) as avg_price
      FROM grooming_services
    `);

    return stats[0];
  }

  // New method: Search services by name or description (useful for staff)
  static async search(searchTerm) {
    const [rows] = await db.execute(
      `SELECT * FROM grooming_services 
       WHERE name LIKE ? OR description LIKE ? 
       ORDER BY name ASC`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );
    return rows;
  }
}

module.exports = GroomingService;