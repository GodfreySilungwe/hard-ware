const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const { protect } = require('../middleware/auth');

// Get all categories
router.get('/', protect, async (req, res) => {
  try {
    const categories = await Category.find({}, req).sort({ name: 1 });
    res.json(categories.filter((category) => !req.user?.tenantId || category.tenantId === req.user.tenantId));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single category
router.get('/:id', protect, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id, req);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    if (req.user?.tenantId && category.tenantId && category.tenantId !== req.user.tenantId) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create category
router.post('/', protect, async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = new Category({ name, description, tenantId: req.user?.tenantId || null });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

// Update category
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true, runValidators: true },
      req
    );
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete category
router.delete('/:id', protect, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id, req);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;