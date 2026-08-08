const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { protect } = require('../middleware/auth');
const { normalizeNumber } = require('../lib/orderMetrics');

const parseRange = (req) => {
  if (req.query.startDateUtc || req.query.endDateUtc) {
    const q = {};
    if (req.query.startDateUtc) q.$gte = req.query.startDateUtc;
    if (req.query.endDateUtc) q.$lte = req.query.endDateUtc;
    return q;
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { $gte: start.toISOString(), $lte: end.toISOString() };
};

// GET /api/dashboard/summary
router.get('/summary', protect, async (req, res) => {
  try {
    const createdAtQuery = parseRange(req);

    // fetch orders in period and populate product details for item names
    const orders = await Order.find({ ...(createdAtQuery ? { createdAt: createdAtQuery } : {}) }, req)
      .populate('items.product')
      .sort({ createdAt: -1 });

    const filtered = (orders || []).filter(o => o?.status !== 'reversed');
    const reversedCount = (orders || []).filter(o => o?.status === 'reversed').length;

    let totalSales = 0;
    let totalProfit = 0;
    let itemsSold = 0;
    let ordersCount = 0;
    let collected = 0;
    let posDirect = 0;
    let posCreditCollected = 0;
    let creditSalesPeriod = 0;
    let outstandingThisPeriod = 0;
    let creditRepaymentFromOrders = 0;
    let creditRepaymentOrderCount = 0;

    const paymentMap = new Map();
    const productMap = new Map();
    const recentOrders = [];

    for (const o of (orders || [])) {
      if (o.status === 'reversed') continue;
      ordersCount += 1;

      const orderTotal = normalizeNumber(o.totalAmount || 0);
      const orderProfit = normalizeNumber(o.profit || 0);
      totalSales += orderTotal;
      totalProfit += orderProfit;

      const paid = normalizeNumber(o.paidAmount || 0);
      const due = normalizeNumber(o.dueAmount || 0);
      const normalizedPaymentMethod = String(o.paymentMethod || '').toLowerCase();

      // collected: immediate orders => total, credit orders => paid amount
      if (normalizedPaymentMethod === 'credit') {
        collected += paid;
        posCreditCollected += paid;
        outstandingThisPeriod += due;
        creditSalesPeriod += orderTotal;
        if (paid > 0) {
          creditRepaymentFromOrders += paid;
          creditRepaymentOrderCount += 1;
        }
      } else {
        collected += orderTotal;
        posDirect += orderTotal;
      }

      // payment method breakdown (sales proceeds per method)
      const method = String(o.paymentMethod || 'unknown');
      const prev = paymentMap.get(method) || { amount: 0, count: 0 };
      const addAmount = normalizedPaymentMethod === 'credit' ? paid : orderTotal;
      paymentMap.set(method, {
        amount: prev.amount + addAmount,
        count: prev.count + 1
      });

      // product aggregation
      if (Array.isArray(o.items)) {
        for (const it of o.items) {
          const pid = it.product?._id || it.product || it.product?.id || (it.productName || Math.random().toString(36).slice(2,8));
          const itemName = it.productName || it.product?.name || it.name || 'Unknown';
          const qty = normalizeNumber(it.quantity || 0);
          const subtotal = normalizeNumber(it.subtotal || (it.priceAtSale || 0) * qty);

          const existing = productMap.get(pid) || { name: itemName, sold: 0, amount: 0 };
          if ((!existing.name || existing.name === 'Unknown' || existing.name === 'Product') && itemName && itemName !== 'Unknown' && itemName !== 'Product') {
            existing.name = itemName;
          }
          existing.sold += qty;
          existing.amount += subtotal;
          productMap.set(pid, existing);

          itemsSold += qty;
        }
      }

      // collect recent orders
      recentOrders.push({ _id: o._id, orderNumber: o.orderNumber, customer: o.customer, items: o.items, totalAmount: orderTotal, paymentMethod: o.paymentMethod, createdAt: o.createdAt });
    }

    // customers and accumulated credits
    const customers = await Customer.find({}, req);
    const customersCount = Array.isArray(customers) ? customers.length : 0;
    const accumulatedCredits = (customers || []).reduce((sum, c) => sum + (normalizeNumber(c.creditBalance || 0)), 0);
    const outstandingCustomers = (customers || []).filter(c => normalizeNumber(c.creditBalance || 0) > 0).length;

    let settlementCountPeriod = 0;
    const settlementCashPeriod = (customers || []).reduce((sum, c) => {
      const entries = Array.isArray(c.creditSettlements) ? c.creditSettlements : [];
      return sum + entries.reduce((innerSum, entry) => {
        if (!entry || !entry.settledAt) return innerSum;
        const settledAt = new Date(entry.settledAt);
        if (settledAt >= new Date(createdAtQuery.$gte) && settledAt <= new Date(createdAtQuery.$lte)) {
          settlementCountPeriod += 1;
          return innerSum + normalizeNumber(entry.amount || 0);
        }
        return innerSum;
      }, 0);
    }, 0);

    const totalCreditRecovered = posCreditCollected + settlementCashPeriod;
    const expectedHandover = posDirect + totalCreditRecovered;

    // products counts and low stock
    const products = await Product.find({}, req);
    const totalProducts = Array.isArray(products) ? products.length : 0;
    const lowStock = (products || []).filter(p => (normalizeNumber(p.currentStock || 0) <= (Number(p.reorderLevel || 5) || 5))).length;

    // format payment methods
    const paymentMethods = Array.from(paymentMap.entries()).map(([method, meta]) => ({
      method,
      amount: meta.amount,
      count: meta.count
    }));

    const totalCreditRepaymentAmount = creditRepaymentFromOrders + settlementCashPeriod;
    const totalCreditRepaymentCount = creditRepaymentOrderCount + settlementCountPeriod;
    if (totalCreditRepaymentAmount > 0) {
      paymentMethods.push({
        method: 'credit_repayment',
        label: 'Credit Repayment',
        count: totalCreditRepaymentCount,
        amount: totalCreditRepaymentAmount
      });
    }

    // build product summary list
    const productSummary = Array.from(productMap.entries()).map(([pid, info]) => {
      const prod = products.find((p) => String(p._id) === String(pid) || String(p.id) === String(pid));
      const name = info.name || prod?.name || 'Unknown';
      const closing = normalizeNumber(prod?.currentStock || 0);
      const costPrice = normalizeNumber(prod?.costPrice || 0);
      const sellingPrice = normalizeNumber(prod?.sellingPrice || 0);
      const startQty = closing + info.sold;
      const remainingQty = closing;
      const remainingValue = costPrice * remainingQty;
      const remainingSellingValue = sellingPrice * remainingQty;

      return {
        productId: pid,
        name,
        startQty,
        soldQty: info.sold,
        closingQty: closing,
        remainingQty,
        remainingValue,
        remainingSellingValue,
        totalAmount: info.amount
      };
    });

    // sort product summary by amount desc
    productSummary.sort((a,b) => b.totalAmount - a.totalAmount);

    // compute totals across all products
    const productSummaryTotals = productSummary.reduce((totals, item) => ({
      startQty: totals.startQty + Number(item.startQty || 0),
      soldQty: totals.soldQty + Number(item.soldQty || 0),
      closingQty: totals.closingQty + Number(item.closingQty || 0),
      remainingValue: totals.remainingValue + Number(item.remainingValue || 0),
      remainingSellingValue: totals.remainingSellingValue + Number(item.remainingSellingValue || 0),
      totalAmount: totals.totalAmount + Number(item.totalAmount || 0)
    }), {
      startQty: 0,
      soldQty: 0,
      closingQty: 0,
      remainingValue: 0,
      remainingSellingValue: 0,
      totalAmount: 0
    });

    // apply pagination for product summary list
    const productPage = Math.max(1, Number(req.query.productPage || 1));
    const productLimit = Math.min(Math.max(1, Number(req.query.productLimit || 10)), 10);
    const totalProductPages = Math.max(1, Math.ceil(productSummary.length / productLimit));
    const productOffset = (productPage - 1) * productLimit;
    const limitedProductSummary = productSummary.slice(productOffset, productOffset + productLimit);
    const recentLimit = Number(req.query.recentLimit || 10);
    const limitedRecentOrders = recentOrders.slice(0, recentLimit);

    // customers with unsettled bills
    const unsettled = (customers || []).filter(c => normalizeNumber(c.creditBalance || 0) > 0).map((c) => {
      // compute outstanding in period and open credit orders count
      const custOrders = (orders || []).filter(o => String(o.customer || '') === String(c._id || c.id) && String(o.paymentMethod || '').toLowerCase() === 'credit');
      const outstandingPeriod = custOrders.reduce((s,o) => s + normalizeNumber(o.dueAmount || 0), 0);
      const openCreditOrders = custOrders.filter(o => normalizeNumber(o.dueAmount || 0) > 0).length;
      return {
        customerId: c._id || c.id,
        name: c.name,
        phone: c.phone,
        outstandingBalanceTotal: normalizeNumber(c.creditBalance || 0),
        outstandingBalancePeriod: outstandingPeriod,
        openCreditOrders
      };
    });

    // totals
    const response = {
      totals: {
        totalSales,
        orders: ordersCount,
        reversed: reversedCount,
        lowStock,
        products: totalProducts,
        collectedSales: collected,
        posDirectSales: posDirect,
        posCreditManagement: posCreditCollected,
        customers: customersCount,
        salesAccounts: 0 // placeholder
      },
      productSummaryTotals,
      handover: {
        totalSales,
        totalProfit,
        ordersProcessed: ordersCount,
        itemsSold,
        customersServed: Array.from(new Set((orders || []).map(o => (o.customer?._id || o.customer || o.customer?.id)).filter(Boolean))).length,
        posDirectSales: posDirect,
        posCreditManagement: posCreditCollected,
        // credit sales in the filtered period (full order totals for credit orders)
        creditSalesPeriod,
        // non-credit POS sales only
        nonCreditPosSales: posDirect,
        // credit collected into cash this period, from order payments and settlements
        settledCreditCash: totalCreditRecovered,
        outstandingCreditPeriod: outstandingThisPeriod,
        accumulatedCredits,
        // expected handover includes non-credit sales plus credit cash recovered this period
        expectedHandover,
      },
      paymentProceeds: paymentMethods,
      productSummary: limitedProductSummary,
      productSummaryPagination: {
        page: productPage,
        totalPages: totalProductPages,
        limit: productLimit,
        totalItems: productSummary.length
      },
      unsettledCustomers: unsettled,
      recentOrders: limitedRecentOrders
    };

    res.json(response);
  } catch (err) {
    console.error('Error building dashboard summary:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
