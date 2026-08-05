const DriverModel = require('../models/driverModel');

const getAllDrivers = (req, res) => {
  try {
    res.json({ success: true, data: DriverModel.findAll() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getDriver = (req, res) => {
  try {
    const driver = DriverModel.findById(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
    res.json({ success: true, data: driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createDriver = (req, res) => {
  try {
    const { name, phone, license_number, address } = req.body;
    const result = DriverModel.create({ name, phone, license_number, address });
    res.status(201).json({ success: true, message: 'Driver created.', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateDriver = (req, res) => {
  try {
    DriverModel.update(req.params.id, req.body);
    res.json({ success: true, message: 'Driver updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteDriver = (req, res) => {
  try {
    DriverModel.delete(req.params.id);
    res.json({ success: true, message: 'Driver deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAllDrivers, getDriver, createDriver, updateDriver, deleteDriver };
