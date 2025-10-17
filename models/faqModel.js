// models\faqModel.js
const db = require('./db');

class Faq {
  static async findAll() {
    const [rows] = await db.query('SELECT * FROM faqs ORDER BY created_at DESC');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM faqs WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async create(question, answer) {
    const [result] = await db.query(
      'INSERT INTO faqs (question, answer) VALUES (?, ?)',
      [question, answer]
    );
    return result.insertId;
  }

  static async update(id, question, answer) {
    const [result] = await db.query(
      'UPDATE faqs SET question = ?, answer = ? WHERE id = ?',
      [question, answer, id]
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await db.query('DELETE FROM faqs WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Faq;