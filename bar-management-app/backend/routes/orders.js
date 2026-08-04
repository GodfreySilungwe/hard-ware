const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Customer = require('../models/Customer');
const { protect, isHardwareManagerOrOwner } = require('../middleware/auth');
const { applyOrderReversal } = require('../lib/orderReversal');
const { summarizeOrders, getPaymentMethodLabel, buildReportSummary, normalizeNumber } = require('../lib/orderMetrics');
const { applyOrderToCustomerAccount } = require('../lib/customerAccountSync');

const populateOrderItemProducts = async (order, req) => {
  if (!order || !Array.isArray(order.items)) return order;

  const items = await Promise.all(order.items.map(async (item) => {
    const productId = typeof item.product === 'string'
      ? item.product
      : item.product?._id || item.product?.id;

    const existingName = typeof item.product === 'object' ? item.product.name : null;
    const product = productId ? await Product.findById(productId, req) : null;
    const productName = existingName && existingName !== 'Product' && existingName !== 'Unknown'
      ? existingName
      : product?.name || 'Unknown';

    let category = null;
    if (item?.product?.category) {
      category = typeof item.product.category === 'string'
        ? { _id: item.product.category, name: 'Unknown' }
        : item.product.category;
    } else if (product?.category) {
      category = typeof product.category === 'string'
        ? { _id: product.category, name: 'Unknown' }
        : product.category;
    }

    if (category && (!category.name || category.name === 'Category')) {
      const categoryId = typeof category._id === 'string' ? category._id : category.id;
      if (categoryId) {
        const categoryRecord = await Category.findById(categoryId, req);
        if (categoryRecord && categoryRecord.name) {
          category = { _id: categoryId, name: categoryRecord.name };
        }
      }
    }

    return {
      ...item,
      product: productId ? {
        _id: productId,
        name: productName,
        costPrice: normalizeNumber(item?.costPrice ?? product?.costPrice ?? 0),
        category
      } : null,
      productName,
      costPrice: normalizeNumber(item?.costPrice ?? product?.costPrice ?? 0)
    };
  }));

  return {
    ...order,
    items
  };
};

const populateOrdersItemProducts = async (orders = [], req) => {
  return Promise.all((orders || []).map((order) => populateOrderItemProducts(order, req)));
};

// expose helpers for unit testing without changing router export behavior
router.populateOrderItemProducts = populateOrderItemProducts;
router.populateOrdersItemProducts = populateOrdersItemProducts;

const parseLocalDateString = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return null;
  const [year, month, day] = dateString.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const buildOrderDateQuery = (startDate, endDate) => {
  const dateQuery = {};
  if (startDate) {
    const parsedStart = parseLocalDateString(startDate);
    if (parsedStart) {
      dateQuery.$gte = parsedStart.toISOString();
    }
  }
  if (endDate) {
    const parsedEnd = parseLocalDateString(endDate);
    if (parsedEnd) {
      parsedEnd.setHours(23, 59, 59, 999);
      dateQuery.$lte = parsedEnd.toISOString();
    }
  }
  return Object.keys(dateQuery).length ? dateQuery : null;
};

// Get all orders
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 0,
      status,
      paymentMethod,
      customerId,
      customerName,
      productName,
      startDate,
      endDate,
      summaryOnly
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    if (customerId) {
      query.customer = customerId;
    }

    if (req.query.startDateUtc || req.query.endDateUtc) {
      const dateQuery = {};
      if (req.query.startDateUtc) dateQuery.$gte = req.query.startDateUtc;
      if (req.query.endDateUtc) dateQuery.$lte = req.query.endDateUtc;
      query.createdAt = dateQuery;
    } else if (startDate || endDate) {
      const createdAt = buildOrderDateQuery(startDate, endDate);
      if (createdAt) {
        query.createdAt = createdAt;
      }
    }

    if (customerName) {
      const matchingCustomers = await Customer.find(
        { name: customerName },
        req
      );
      const customerIds = (matchingCustomers || [])
        .map((customer) => customer._id || customer.id)
        .filter(Boolean);
      if (customerIds.length === 0) {
        return res.json({ orders: [], totalCount: 0, totalPages: 0, page: 1, limit: Number(limit) });
      }
      query.customer = customerIds;
    }

    const orders = await Order.find(query, req)
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });

    const populatedOrders = await populateOrdersItemProducts(orders, req);
    let normalizedOrders = populatedOrders.map((order) => ({
      ...order,
      paymentMethodLabel: order.paymentMethodLabel || getPaymentMethodLabel(order.paymentMethod)
    }));

    if (productName) {
      const matchingProducts = await Product.find({ name: productName }, req);
      const matchingProductIds = (matchingProducts || []).map((product) => product._id || product.id).filter(Boolean);
      if (matchingProductIds.length === 0) {
        return res.json({ orders: [], totalCount: 0, count: 0, totalPages: 0, page: 1, limit: Number(limit), totalSales: 0, totalProfit: 0, totalSalesNet: 0, totalTax: 0, averageOrderValue: 0, averageItemsPerOrder: 0, totalItems: 0 });
      }
      normalizedOrders = normalizedOrders.filter((order) => {
        if (!Array.isArray(order.items)) return false;
        return order.items.some((item) => {
          const productId = item.product?._id || item.product?.id || item.product;
          return matchingProductIds.includes(productId);
        });
      });
    }

    const summary = summarizeOrders(normalizedOrders, { includeReversed: false });
    const commonResponse = {
      totalCount: normalizedOrders.length,
      count: summary.count,
      totalSales: summary.totalSales,
      totalProfit: summary.totalProfit,
      totalSalesNet: summary.totalSalesNet,
      totalTax: summary.totalTax,
      averageOrderValue: summary.averageOrderValue,
      averageItemsPerOrder: summary.averageItemsPerOrder,
      totalItems: summary.totalItems,
      paymentMethods: summary.paymentMethods
    };

    if (summaryOnly === 'true' || summaryOnly === '1') {
      const reportSummary = buildReportSummary(normalizedOrders, { includeReversed: false });
      const { sales, ...summaryOnlyResponse } = reportSummary;
      return res.json({
        ...summaryOnlyResponse,
        totalCount: normalizedOrders.length,
        count: reportSummary.totalOrders,
        totalPages: 0,
        page: 1,
        limit: Number(limit) || 0
      });
    }

    if (Number(limit) > 0) {
      const pageNumber = Math.max(Number(page), 1);
      const offset = (pageNumber - 1) * Number(limit);
      const pagedOrders = normalizedOrders.slice(offset, offset + Number(limit));
      const totalPages = Math.max(1, Math.ceil(commonResponse.totalCount / Number(limit)));

      return res.json({
        orders: pagedOrders,
        ...commonResponse,
        totalPages,
        page: pageNumber,
        limit: Number(limit)
      });
    }

    res.json({ orders: normalizedOrders, ...commonResponse });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get today's orders (for dashboard) or orders summary for a date range
router.get('/today', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let createdAtQuery = null;
    if (req.query.startDateUtc || req.query.endDateUtc) {
      createdAtQuery = {};
      if (req.query.startDateUtc) createdAtQuery.$gte = req.query.startDateUtc;
      if (req.query.endDateUtc) createdAtQuery.$lte = req.query.endDateUtc;
    } else {
      createdAtQuery = buildOrderDateQuery(startDate, endDate);
    }

    if (!createdAtQuery) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      createdAtQuery = {
        $gte: startOfDay.toISOString(),
        $lte: endOfDay.toISOString()
      };
    }

    const orders = await Order.find({
      createdAt: createdAtQuery
    }, req)
      .populate('customer', 'name phone')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });

    const populatedTodayOrders = await populateOrdersItemProducts(orders, req);
    const summary = summarizeOrders(populatedTodayOrders, { includeReversed: false });
    const reversedOrders = populatedTodayOrders.filter((order) => order.status === 'reversed').length;

    res.json({
      count: summary.count,
      totalSales: summary.totalSales,
      totalTax: summary.totalTax,
      totalSalesNet: summary.totalSalesNet,
      totalProfit: summary.totalProfit,
      orders: summary.orders,
      paymentMethods: summary.paymentMethods,
      reversedOrders,
      totalOrders: populatedTodayOrders.length
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
    const savedOrder = await Order.findById(order._id, req)
      .populate('customer', 'name phone')
      .populate('items.product', 'name');
    const populatedOrder = await populateOrderItemProducts(savedOrder, req);
    res.status(201).json(populatedOrder);

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

    const populatedOrder = await populateOrderItemProducts(order, req);
    res.json(populatedOrder);
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