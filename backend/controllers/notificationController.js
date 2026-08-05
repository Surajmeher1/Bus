const NotificationModel = require('../models/notificationModel');

const getNotifications = (req, res) => {
  try {
    const { role, id } = req.user;
    const notifications = NotificationModel.findForUser(role, id);
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAllNotifications = (req, res) => {
  try {
    res.json({ success: true, data: NotificationModel.findAll() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createNotification = (req, res) => {
  try {
    const { title, message, receiver_type, receiver_id, is_emergency } = req.body;
    const result = NotificationModel.create({
      title, message,
      receiver_type: receiver_type || 'all',
      receiver_id: receiver_id || null,
      sent_by_type: req.user.role,
      sent_by_id: req.user.id,
      is_emergency: is_emergency ? 1 : 0
    });

    // Broadcast via Socket.IO
    if (req.io) {
      const payload = { title, message, is_emergency: !!is_emergency, created_at: new Date().toISOString() };
      if (receiver_type === 'all' || !receiver_type) {
        req.io.emit('notification', payload);
      } else if (receiver_type === 'bus' && receiver_id) {
        req.io.to(`bus-${receiver_id}`).emit('notification', payload);
      } else {
        req.io.emit('notification', payload);
      }
    }

    res.status(201).json({ success: true, message: 'Notification sent.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteNotification = (req, res) => {
  try {
    NotificationModel.delete(req.params.id);
    res.json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getNotifications, getAllNotifications, createNotification, deleteNotification };
