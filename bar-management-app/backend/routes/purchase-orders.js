const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');
const { normalizePurchaseOrderItems, canUpdatePurchaseOrderStatus } = require('../lib/purchaseOrderRules');

// Get all purchase orders
router.get('/', protect, async (req, res) => {
  try {
    const orders = await PurchaseOrder.find({}, req)
      .populate('supplier', 'name')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single purchase order
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id, req)
      .populate('supplier', 'name phone email')
      .populate('items.product', 'name');
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create purchase order
router.post('/', protect, async (req, res) => {
  try {
    const { supplier, items, expectedDelivery, notes } = req.body;

    if (!supplier) {
      return res.status(400).json({ message: 'Supplier is required' });
    }

    let normalizedItems;
    try {
      normalizedItems = normalizePurchaseOrderItems(items);
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }

    // Check supplier exists
    const supplierExists = await Supplier.findById(supplier, req);
    if (!supplierExists) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const normalizedDelivery = expectedDelivery ? new Date(expectedDelivery).toISOString() : null;

    let totalAmount = 0;
    const orderItems = [];
    const products = [];

    // Process each item
    for (const item of normalizedItems) {
      const product = await Product.findById(item.product, req);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const subtotal = item.costPrice * item.quantity;
      totalAmount += subtotal;
      products.push(product);

      orderItems.push({
        product: item.product,
        quantity: item.quantity,
        costPrice: item.costPrice,
        subtotal
      });
    }

    const order = new PurchaseOrder({
      supplier,
      items: orderItems,
      totalAmount,
      expectedDelivery: normalizedDelivery,
      notes,
      status: 'pending',
      tenantId: req.user?.tenantId || null
    });

    const originalCosts = new Map(products.map((product) => [product._id, product.costPrice]));

    try {
      for (const [index, product] of products.entries()) {
        product.costPrice = normalizedItems[index].costPrice;
        await product.save();
      }

      await order.save();
    } catch (saveError) {
      await Promise.all(products.map(async (product) => {
        product.costPrice = originalCosts.get(product._id);
        await product.save();
      })).catch((rollbackError) => {
        console.error('Error rolling back product cost prices:', rollbackError);
      });
      throw saveError;
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update purchase order status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await PurchaseOrder.findById(req.params.id, req);
    
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (!canUpdatePurchaseOrderStatus(order.status, status)) {
      return res.status(400).json({ message: `Cannot change order status from ${order.status} to ${status}` });
    }

    if (order.status === status) {
      return res.json(order);
    }

    order.status = status;
    
    // If status is 'received', update product stock
    if (status === 'received') {
      order.receivedDate = new Date().toISOString();

      const products = [];
      for (const item of order.items) {
        const product = await Product.findById(item.product, req);
        if (!product) {
          return res.status(404).json({ message: `Product not found: ${item.product}` });
        }
        products.push(product);
      }

      const originalStocks = new Map(products.map((product) => [product._id, product.currentStock]));
      try {
        for (const [index, product] of products.entries()) {
          product.currentStock = Number(product.currentStock) + Number(order.items[index].quantity);
          await product.save();
        }

        await order.save();
      } catch (saveError) {
        await Promise.all(products.map(async (product) => {
          product.currentStock = originalStocks.get(product._id);
          await product.save();
        })).catch((rollbackError) => {
          console.error('Error rolling back product stock:', rollbackError);
        });
        throw saveError;
      }

      return res.json(order);
    }

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error updating purchase order status:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete purchase order
router.delete('/:id', protect, async (req, res) => {
  try {
    const order = await PurchaseOrder.findByIdAndDelete(req.params.id, req);
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;