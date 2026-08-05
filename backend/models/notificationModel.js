const db = require('../config/db');

const NotificationModel = {
  findAll: (limit = 50) =>
    db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?').all(limit),

  findForUser: (receiverType, receiverId = null) =>
    db.prepare(`
      SELECT * FROM notifications
      WHERE receiver_type = 'all' OR receiver_type = ?
        OR (receiver_type = ? AND receiver_id = ?)
      ORDER BY created_at DESC LIMIT 30
    `).all(receiverType, receiverType, receiverId),

  create: (data) =>
    db.prepare(`
      INSERT INTO notifications (title, message, receiver_type, receiver_id, sent_by_type, sent_by_id, is_emergency)
      VALUES (@title, @message, @receiver_type, @receiver_id, @sent_by_type, @sent_by_id, @is_emergency)
    `).run(data),

  delete: (id) =>
    db.prepare('DELETE FROM notifications WHERE notification_id = ?').run(id),
};

module.exports = NotificationModel;
