const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { protect } = require('../middleware/auth');

// Get all customers
router.get('/', protect, async (req, res) => {
  try {
    const customers = await Customer.find({}, req).sort({ name: 1 });
    res.json(customers.filter((customer) => !req.user?.tenantId || customer.tenantId === req.user.tenantId));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single customer
router.get('/:id', protect, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id, req);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    if (req.user?.tenantId && customer.tenantId && customer.tenantId !== req.user.tenantId) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create customer
router.post('/', protect, async (req, res) => {
  try {
    const { name, phone, gender } = req.body;
    const customer = new Customer({ name, phone, gender, tenantId: req.user?.tenantId || req.body?.tenantId || null });
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Phone number already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

// Update customer
router.put('/:id', protect, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
      req
    );
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete customer
router.delete('/:id', protect, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id, req);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;