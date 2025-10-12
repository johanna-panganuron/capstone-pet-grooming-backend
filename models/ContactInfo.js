// models/ContactInfo.js
const db = require('./db');

class ContactInfo {
  static async getContactInfo() {
    try {
      const [rows] = await db.execute('SELECT * FROM contact_info ORDER BY id DESC LIMIT 1');
      return rows[0] || null;
    } catch (error) {
      console.error('❌ Error fetching contact info:', error);
      throw error;
    }
  }

  static async createContactInfo(data) {
    try {
      const { shop_name, description, address, phone_number, email, business_hours } = data;
      
      const [result] = await db.execute(
        'INSERT INTO contact_info (shop_name, description, address, phone_number, email, business_hours) VALUES (?, ?, ?, ?, ?, ?)',
        [shop_name, description || '', address, phone_number, email, business_hours]
      );
      
      return result.insertId;
    } catch (error) {
      console.error('❌ Error creating contact info:', error);
      throw error;
    }
  }

  static async updateContactInfo(id, data) {
    try {
      const { shop_name, description, address, phone_number, email, business_hours } = data;
      
      const [result] = await db.execute(
        'UPDATE contact_info SET shop_name = ?, description = ?, address = ?, phone_number = ?, email = ?, business_hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [shop_name, description || '', address, phone_number, email, business_hours, id]
      );
      
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Error updating contact info:', error);
      throw error;
    }
  }

  static async deleteContactInfo(id) {
    try {
      const [result] = await db.execute('DELETE FROM contact_info WHERE id = ?', [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Error deleting contact info:', error);
      throw error;
    }
  }
}

module.exports = ContactInfo;