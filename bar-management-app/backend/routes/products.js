const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const { canDeleteProduct } = require('../lib/deletionRules');

// Get all products with optional pagination and search
router.get('/', protect, async (req, res) => {
  try {
    const { limit, offset, search, category } = req.query;
    const limitNum = Math.max(0, Number(limit) || 0);
    const offsetNum = Math.max(0, Number(offset) || 0);
    const categoryId = category && category !== 'all' ? category : null;

    const query = {};
    if (categoryId) {
      query.category = categoryId;
    }

    const products = await Product.find(query, req).populate('category', 'name');
    const scopedProducts = products.filter((product) => !req.user?.tenantId || product.tenantId === req.user.tenantId);

    if (search && search.trim().length > 0) {
      const normalized = search.trim().toLowerCase();
      const scoredProducts = scopedProducts
        .map((product) => {
          const name = product.name?.toLowerCase() || '';
          const unit = product.unit?.toLowerCase() || '';
          const categoryName = product.category?.name?.toLowerCase() || '';
          let score = 0;

          if (name === normalized) score += 100;
          else if (name.startsWith(normalized)) score += 80;
          else if (name.includes(normalized)) score += 50;

          if (unit === normalized) score += 20;
          else if (unit.includes(normalized)) score += 10;

          if (categoryName === normalized) score += 15;
          else if (categoryName.includes(normalized)) score += 8;

          return { product, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limitNum > 0 ? limitNum : 3)
        .map(({ product }) => product);

      return res.json(scoredProducts);
    }

    const pagedProducts = limitNum > 0
      ? scopedProducts.slice(offsetNum, offsetNum + limitNum)
      : scopedProducts;

    res.json(pagedProducts);
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
      tenantId: req.user?.tenantId || null
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
    const product = await Product.findById(req.params.id, req);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { allowed, reason } = canDeleteProduct(product);
    if (!allowed) {
      return res.status(400).json({ message: reason });
    }

    await Product.findByIdAndDelete(req.params.id, req);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;