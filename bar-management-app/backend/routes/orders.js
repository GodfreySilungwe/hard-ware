const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

// Get all orders
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get today's orders (for dashboard)
router.get('/today', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const orders = await Order.find({
      createdAt: { $gte: startOfDay }
    });
    
    const totalSales = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (o.profit || 0), 0);
    
    res.json({
      count: orders.length,
      totalSales,
      totalProfit,
      orders
    });
  } catch (error) {
    console.error('Error fetching today orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create order (POS)
router.post('/', async (req, res) => {
  try {
    const { customer, items, paymentMethod } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    let totalAmount = 0;
    let totalCost = 0;
    const orderItems = [];

    // Process each item
    for (const item of items) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      // Check if enough stock
      if (product.currentStock < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.currentStock}`
        });
      }

      // Deduct from inventory
      product.currentStock -= item.quantity;
      await product.save();

      const subtotal = product.sellingPrice * item.quantity;
      totalAmount += subtotal;
      totalCost += product.costPrice * item.quantity;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        priceAtSale: product.sellingPrice,
        subtotal
      });
    }

    // Update customer total spent
    if (customer) {
      const customerDoc = await Customer.findById(customer);
      if (customerDoc) {
        customerDoc.totalSpent += totalAmount;
        customerDoc.loyaltyPoints += Math.floor(totalAmount / 100);
        await customerDoc.save();
      }
    }

    // Create order - NO createdBy field
    const order = new Order({
      orderNumber: `ORD-${Date.now().toString().slice(-8)}`,
      customer: customer || null,
      items: orderItems,
      totalAmount,
      profit: totalAmount - totalCost,
      paymentMethod: paymentMethod || 'cash'
    });

    await order.save();
    res.status(201).json(order);

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get order by ID
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone')
      .populate('items.product', 'name');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;