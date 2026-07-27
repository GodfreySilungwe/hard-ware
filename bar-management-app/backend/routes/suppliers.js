const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

// Get all suppliers
router.get('/', protect, async (req, res) => {
  try {
    const suppliers = await Supplier.find({}, req).sort({ name: 1 });
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single supplier
router.get('/:id', protect, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id, req).populate('products', 'name');
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create supplier
router.post('/', protect, async (req, res) => {
  try {
    const supplier = new Supplier({ ...req.body, tenantId: req.user?.tenantId || req.body?.tenantId || null });
    await supplier.save();
    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update supplier
router.put('/:id', protect, async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
      req
    );
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete supplier
router.delete('/:id', protect, async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id, req);
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get supplier purchase orders
router.get('/:id/orders', protect, async (req, res) => {
  try {
    const orders = await PurchaseOrder.find({ supplier: req.params.id }, req)
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching supplier orders:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;