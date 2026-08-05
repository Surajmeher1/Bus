const FeedbackModel = require('../models/feedbackModel');

const getAllFeedback = (req, res) => {
  try {
    res.json({ success: true, data: FeedbackModel.findAll() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getFeedbackByBus = (req, res) => {
  try {
    const feedback = FeedbackModel.findByBus(req.params.busId);
    const stats = FeedbackModel.getAverageRating(req.params.busId);
    res.json({ success: true, data: feedback, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getMyFeedback = (req, res) => {
  try {
    res.json({ success: true, data: FeedbackModel.findByStudent(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const submitFeedback = (req, res) => {
  try {
    const { bus_id, message, rating } = req.body;
    FeedbackModel.create({ student_id: req.user.id, bus_id, message, rating: parseInt(rating) });
    res.status(201).json({ success: true, message: 'Feedback submitted. Thank you!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllFeedback, getFeedbackByBus, getMyFeedback, submitFeedback };
