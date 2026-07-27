const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

// Get all products
router.get('/', protect, async (req, res) => {
  try {
    const products = await Product.find({}, req).populate('category', 'name');
    res.json(products.filter((product) => !req.user?.tenantId || product.tenantId === req.user.tenantId));
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get low stock products
router.get('/low-stock', protect, async (req, res) => {
  try {
    const products = await Product.find({
      $expr: {
        $lte: ['$currentStock', '$lowStockThreshold']
      }
    }, req).populate('category', 'name');
    const scopedProducts = (products || []).filter((product) => !req.user?.tenantId || product.tenantId === req.user.tenantId);
    res.json(scopedProducts);
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single product
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id, req).populate('category', 'name');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (req.user?.tenantId && product.tenantId && product.tenantId !== req.user.tenantId) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create product
router.post('/', protect, async (req, res) => {
  try {
    const product = new Product({
      ...req.body,
      tenantId: req.user?.tenantId || req.body?.tenantId || null
    });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update product - FIXED
router.put('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id, req);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (req.user?.tenantId && product.tenantId && product.tenantId !== req.user.tenantId) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update fields
    const { name, category, costPrice, sellingPrice, currentStock, lowStockThreshold, unit } = req.body;
    
    product.name = name || product.name;
    product.category = category || product.category;
    product.costPrice = costPrice !== undefined ? costPrice : product.costPrice;
    product.sellingPrice = sellingPrice !== undefined ? sellingPrice : product.sellingPrice;
    product.currentStock = currentStock !== undefined ? currentStock : product.currentStock;
    product.lowStockThreshold = lowStockThreshold !== undefined ? lowStockThreshold : product.lowStockThreshold;
    product.unit = unit || product.unit;

    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete product
router.delete('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id, req);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;