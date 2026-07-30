const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { protect, isHardwareManagerOrOwner } = require('../middleware/auth');
const { applyOrderReversal } = require('../lib/orderReversal');
const { summarizeOrders, getPaymentMethodLabel } = require('../lib/orderMetrics');
const { applyOrderToCustomerAccount } = require('../lib/customerAccountSync');

// Get all orders
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({}, req)
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });

    const normalizedOrders = orders.map((order) => ({
      ...order,
      paymentMethodLabel: order.paymentMethodLabel || getPaymentMethodLabel(order.paymentMethod)
    }));

    res.json(normalizedOrders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get today's orders (for dashboard)
router.get('/today', protect, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const allOrders = await Order.find({}, req)
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });

    const todaysOrders = (allOrders || []).filter((order) => {
      const orderDate = new Date(order.createdAt || order.created_at || order.date || order.updatedAt || order.updated_at || null);
      return !Number.isNaN(orderDate.getTime()) && orderDate >= startOfDay && orderDate <= endOfDay;
    });

    const summary = summarizeOrders(todaysOrders, { includeReversed: false });
    const reversedOrders = todaysOrders.filter((order) => order.status === 'reversed').length;

    res.json({
      count: summary.count,
      totalSales: summary.totalSales,
      totalTax: summary.totalTax,
      totalSalesNet: summary.totalSalesNet,
      totalProfit: summary.totalProfit,
      orders: summary.orders,
      reversedOrders,
      totalOrders: todaysOrders.length
    });
  } catch (error) {
    console.error('Error fetching today orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create order (POS)
router.post('/', protect, async (req, res) => {
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
      const product = await Product.findById(item.product, req);
      
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

    // Sync customer account metrics with POS activity
    if (customer) {
      const customerDoc = await Customer.findById(customer, req);
      if (customerDoc) {
        applyOrderToCustomerAccount(customerDoc, totalAmount);
        await customerDoc.save();
      }
    }

    // Create order - NO createdBy field
    const taxCompliant = Boolean(req.body?.taxCompliant);
    const TAX_RATE = 0.175;
    let taxAmount = Number(req.body?.taxAmount || 0);
    let netAmount = Number(req.body?.netAmount || 0);

    if (taxCompliant) {
      if (!Number.isFinite(taxAmount) || taxAmount <= 0) {
        netAmount = totalAmount / (1 + TAX_RATE);
        taxAmount = totalAmount - netAmount;
      } else if (!Number.isFinite(netAmount) || netAmount <= 0) {
        netAmount = totalAmount - taxAmount;
      }
    } else {
      taxAmount = 0;
      netAmount = totalAmount;
    }

    // compute profit: use netAmount for tax-compliant orders to exclude tax from profit
    const profitBase = (taxCompliant ? netAmount : totalAmount) - totalCost;

    const order = new Order({
      orderNumber: `ORD-${Date.now().toString().slice(-8)}`,
      customer: customer || null,
      items: orderItems,
      totalAmount,
      profit: profitBase,
      paymentMethod: paymentMethod || 'cash',
      paymentMethodLabel: getPaymentMethodLabel(paymentMethod || 'cash'),
      status: 'completed',
      tenantId: req.user?.tenantId || null,
      taxCompliant,
      taxAmount,
      netAmount
    });

    await order.save();
    res.status(201).json(order);

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get order by ID
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id, req)
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

// Reverse an order sale and restore inventory
router.patch('/:id/reverse', protect, isHardwareManagerOrOwner, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id, req);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status === 'reversed') {
      return res.status(400).json({ message: 'This sale has already been reversed' });
    }

    const reversalResult = await applyOrderReversal(
      order,
      async (productId) => Product.findById(productId, req),
      req.user,
      {
        reason: req.body?.reason || 'No reason provided',
        notes: req.body?.notes || '',
        customerFinder: async (customerId) => Customer.findById(customerId, req)
      }
    );

    await order.save();
    res.json(reversalResult.order);
  } catch (error) {
    console.error('Error reversing order:', error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;