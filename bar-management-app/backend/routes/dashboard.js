const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');
const { normalizeNumber } = require('../lib/orderMetrics');
const dynamodb = require('../lib/dynamodb');
const legacyGSIStatusByTenant = new Map();

const getReferenceId = (reference) => String(reference?._id || reference?.id || reference || '');

const matchesCreatedAtRange = (record, range) => {
  const createdAt = String(record?.createdAt || '');
  return (!range?.$gte || createdAt >= range.$gte) && (!range?.$lte || createdAt <= range.$lte);
};

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

const buildProductSummary = ({
  products = [],
  productMap = new Map(),
  purchaseOrderQtyMap = new Map(),
  productPage = 1,
  productLimit = 20,
  defaultProductLimit = 20
}) => {
  const productSummary = buildProductSummaryRows({ products, productMap, purchaseOrderQtyMap });
  return paginateProductSummary(productSummary, productPage, productLimit, defaultProductLimit);
};

const buildProductSummaryRows = ({ products = [], productMap = new Map(), purchaseOrderQtyMap = new Map() }) => {
  const mergedProducts = [...(Array.isArray(products) ? products : [])];
  const productIds = new Set(mergedProducts.map((product) => String(product?._id || product?.id)));
  for (const [pid, info] of (productMap || new Map()).entries()) {
    if (!productIds.has(String(pid))) {
      mergedProducts.push({
        _id: pid,
        id: pid,
        name: info?.name || 'Unknown',
        currentStock: 0,
        costPrice: 0,
        sellingPrice: 0
      });
      productIds.add(String(pid));
    }
  }

  const productSummary = mergedProducts.map((product) => {
    const pid = String(product?._id || product?.id || product?.name || 'unknown');
    const info = productMap.get(pid) || { name: product?.name || 'Unknown', sold: 0, amount: 0 };
    const name = info.name || product?.name || 'Unknown';
    const closing = normalizeNumber(product?.currentStock || 0);
    const costPrice = normalizeNumber(product?.costPrice || 0);
    const sellingPrice = normalizeNumber(product?.sellingPrice || 0);
    const purchaseOrderQty = normalizeNumber(purchaseOrderQtyMap.get(pid) || 0);
    const soldQty = normalizeNumber(info.sold || 0);
    const totalAmount = normalizeNumber(info.amount || 0);
    const startQty = closing + soldQty;
    const remainingQty = closing;
    const remainingValue = costPrice * remainingQty;
    const remainingSellingValue = sellingPrice * remainingQty;

    return {
      productId: pid,
      name,
      startQty,
      purchaseOrderQty,
      soldQty,
      closingQty: closing,
      remainingQty,
      remainingValue,
      remainingSellingValue,
      totalAmount
    };
  });

  productSummary.sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    return String(a.name).localeCompare(String(b.name));
  });

  return productSummary;
};

const paginateProductSummary = (productSummary, productPage, productLimit, defaultProductLimit) => {
  const normalizedLimit = Math.min(Math.max(1, Number(productLimit || defaultProductLimit)), 20);
  const normalizedPage = Math.max(1, Number(productPage || 1));
  const totalProductPages = Math.max(1, Math.ceil(productSummary.length / normalizedLimit));
  const page = Math.min(normalizedPage, totalProductPages);
  const productOffset = (page - 1) * normalizedLimit;

  return {
    productSummary: productSummary.slice(productOffset, productOffset + normalizedLimit),
    productSummaryPagination: {
      page,
      totalPages: totalProductPages,
      limit: normalizedLimit,
      totalItems: productSummary.length
    }
  };
};

// GET /api/dashboard/summary
router.get('/summary', protect, async (req, res) => {
  try {
    const createdAtQuery = parseRange(req);

    // Use the implicit today range for tenant GSI queries as well.
    const startDate = req.query.startDateUtc || createdAtQuery.$gte;
    const endDate = req.query.endDateUtc || createdAtQuery.$lte;

    let orders = [];
    const tenantId = req.user?.tenantId;

    // Attempt GSI query for date-range queries (more efficient)
    if ((startDate || endDate) && tenantId) {
      try {
        if (legacyGSIStatusByTenant.get(tenantId) === true) {
          orders = await Order.find({ tenantId, createdAt: createdAtQuery }, req);
        } else {
          console.log(`📊 Dashboard: Attempting GSI query for tenant ${tenantId} (${startDate} to ${endDate})`);
          const gsiOrders = await dynamodb.queryByGSI(tenantId, startDate, endDate);
          console.log(`✅ Dashboard: GSI query returned ${gsiOrders.length} orders`);

          if (!legacyGSIStatusByTenant.has(tenantId)) {
            const tenantOrders = await Order.find({ tenantId }, req);
            const hasLegacyOrders = tenantOrders.some((order) => !order.GSI1PK || !order.GSI1SK);
            legacyGSIStatusByTenant.set(tenantId, hasLegacyOrders);
            orders = hasLegacyOrders
              ? tenantOrders.filter((order) => matchesCreatedAtRange(order, createdAtQuery))
              : gsiOrders;
          } else {
            orders = gsiOrders;
          }
        }
      } catch (gsiError) {
        console.warn(`⚠️  Dashboard: GSI query failed, falling back to scan: ${gsiError.message}`);
        orders = await Order.find({ ...(createdAtQuery ? { createdAt: createdAtQuery } : {}) }, req);
      }
    } else {
      // No date range, use legacy scan
      orders = await Order.find({ ...(createdAtQuery ? { createdAt: createdAtQuery } : {}) }, req);
    }

    // Load products once and reuse them for order item names and inventory metrics.
    const tenantFilter = (records) => (records || []).filter((record) => (
      !req.user?.tenantId || record.tenantId === req.user.tenantId
    ));
    const [products, purchaseOrders, customers] = await Promise.all([
      dynamodb.listEntities('product', {
        projection: ['_id', 'id', 'tenantId', 'name', 'currentStock', 'costPrice', 'sellingPrice', 'lowStockThreshold', 'reorderLevel']
      }).then(tenantFilter),
      dynamodb.listEntities('purchaseorder', {
        projection: ['_id', 'id', 'tenantId', 'createdAt', 'items']
      }).then((records) => tenantFilter(records).filter((record) => {
        const createdAt = String(record.createdAt || '');
        return (!createdAtQuery.$gte || createdAt >= createdAtQuery.$gte) && (!createdAtQuery.$lte || createdAt <= createdAtQuery.$lte);
      }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))),
      dynamodb.listEntities('customer', {
        projection: ['_id', 'id', 'tenantId', 'creditBalance', 'creditSettlements', 'name', 'phone']
      }).then(tenantFilter)
    ]);
    const productsById = new Map((products || []).map((product) => [String(product?._id || product?.id), product]));

    orders = await Promise.all(orders.map(async (order) => {
      if (!Array.isArray(order.items)) return order;
      const populatedItems = order.items.map((item) => {
        if (item.product && typeof item.product === 'string') {
          const product = productsById.get(String(item.product)) || null;
          return { ...item, product };
        }
        return item;
      });
      return { ...order, items: populatedItems };
    }));

    const filtered = (orders || []).filter(o => o?.status !== 'reversed');
    const reversedCount = (orders || []).filter(o => o?.status === 'reversed').length;

    let totalSales = 0;
    let totalSalesNet = 0;
    let totalTax = 0;
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
    const purchaseOrderQtyMap = new Map();
    const recentLimit = Math.max(0, Math.min(100, Number(req.query.recentLimit || 10)));
    const recentOrders = [];

    for (const po of (purchaseOrders || [])) {
      if (Array.isArray(po.items)) {
        for (const it of po.items) {
          const pid = getReferenceId(it.product) || it.productName || Math.random().toString(36).slice(2, 8);
          const qty = normalizeNumber(it.quantity || 0);
          const existing = purchaseOrderQtyMap.get(pid) || 0;
          purchaseOrderQtyMap.set(pid, existing + qty);
        }
      }
    }

    for (const o of (orders || [])) {
      if (o.status === 'reversed') continue;
      ordersCount += 1;

      const orderTotal = normalizeNumber(o.totalAmount || 0);
      const orderProfit = normalizeNumber(o.profit || 0);
      totalSales += orderTotal;
      totalSalesNet += Number.isFinite(Number(o.netAmount)) ? normalizeNumber(o.netAmount) : orderTotal;
      totalTax += normalizeNumber(o.taxAmount || 0);
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
          const pid = getReferenceId(it.product) || it.productName || Math.random().toString(36).slice(2,8);
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
      if (recentOrders.length < recentLimit) {
        recentOrders.push({ _id: o._id, orderNumber: o.orderNumber, customer: o.customer, items: o.items, totalAmount: orderTotal, paymentMethod: o.paymentMethod, createdAt: o.createdAt });
      }
    }

    // customers and accumulated credits
    const customersCount = Array.isArray(customers) ? customers.length : 0;
    const accumulatedCredits = (customers || []).reduce((sum, c) => sum + (normalizeNumber(c.creditBalance || 0)), 0);
    const outstandingCustomers = (customers || []).filter(c => normalizeNumber(c.creditBalance || 0) > 0).length;

    let settlementCountPeriod = 0;
    const settlementCashPeriod = (customers || []).reduce((sum, c) => {
      const entries = Array.isArray(c.creditSettlements) ? c.creditSettlements : [];
      return sum + entries.reduce((innerSum, entry) => {
        if (!entry || !entry.settledAt) return innerSum;
        const settledAt = new Date(entry.settledAt);
        const startsInRange = !createdAtQuery.$gte || settledAt >= new Date(createdAtQuery.$gte);
        const endsInRange = !createdAtQuery.$lte || settledAt <= new Date(createdAtQuery.$lte);
        if (startsInRange && endsInRange) {
          settlementCountPeriod += 1;
          return innerSum + normalizeNumber(entry.amount || 0);
        }
        return innerSum;
      }, 0);
    }, 0);

    const totalCreditRecovered = posCreditCollected + settlementCashPeriod;
    const expectedHandover = posDirect + totalCreditRecovered;

    // products counts and low stock
    const totalProducts = Array.isArray(products) ? products.length : 0;
    const lowStockProducts = (products || []).filter((product) => {
      const rawThreshold = product.lowStockThreshold ?? product.reorderLevel;
      const threshold = rawThreshold === '' || rawThreshold === null || rawThreshold === undefined
        ? 5
        : Number(rawThreshold);
      return normalizeNumber(product.currentStock || 0) <= (Number.isFinite(threshold) ? threshold : 5);
    });
    const lowStock = lowStockProducts.length;

    const inventoryValueAtCost = (products || []).reduce((sum, product) => {
      const quantity = normalizeNumber(product.currentStock || 0);
      const costPrice = normalizeNumber(product.costPrice || 0);
      return sum + quantity * costPrice;
    }, 0);

    const inventoryValueAtSellingPrice = (products || []).reduce((sum, product) => {
      const quantity = normalizeNumber(product.currentStock || 0);
      const sellingPrice = normalizeNumber(product.sellingPrice || 0);
      return sum + quantity * sellingPrice;
    }, 0);

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

    const productPage = Math.max(1, Number(req.query.productPage || 1));
    const productLimit = Math.min(Math.max(1, Number(req.query.productLimit || 20)), 20);

    const productSummary = buildProductSummaryRows({ products, productMap, purchaseOrderQtyMap });
    const { productSummary: limitedProductSummary, productSummaryPagination } = paginateProductSummary(
      productSummary,
      productPage,
      productLimit,
      20
    );

    const productSummaryTotals = productSummary.reduce((totals, item) => ({
      startQty: totals.startQty + Number(item.startQty || 0),
      purchaseOrderQty: totals.purchaseOrderQty + Number(item.purchaseOrderQty || 0),
      soldQty: totals.soldQty + Number(item.soldQty || 0),
      closingQty: totals.closingQty + Number(item.closingQty || 0),
      remainingValue: totals.remainingValue + Number(item.remainingValue || 0),
      remainingSellingValue: totals.remainingSellingValue + Number(item.remainingSellingValue || 0),
      totalAmount: totals.totalAmount + Number(item.totalAmount || 0)
    }), {
      startQty: 0,
      purchaseOrderQty: 0,
      soldQty: 0,
      closingQty: 0,
      remainingValue: 0,
      remainingSellingValue: 0,
      totalAmount: 0
    });

    const limitedRecentOrders = recentOrders;

    // customers with unsettled bills
    const creditOrdersByCustomer = new Map();
    for (const order of orders || []) {
      if (String(order.paymentMethod || '').toLowerCase() !== 'credit') continue;
      const customerId = getReferenceId(order.customer);
      if (!customerId) continue;

      const creditSummary = creditOrdersByCustomer.get(customerId) || { outstandingPeriod: 0, openCreditOrders: 0 };
      const dueAmount = normalizeNumber(order.dueAmount || 0);
      creditSummary.outstandingPeriod += dueAmount;
      if (dueAmount > 0) creditSummary.openCreditOrders += 1;
      creditOrdersByCustomer.set(customerId, creditSummary);
    }

    const unsettled = (customers || []).filter(c => normalizeNumber(c.creditBalance || 0) > 0).map((c) => {
      // compute outstanding in period and open credit orders count
      const customerId = String(c._id || c.id);
      const customerCredit = creditOrdersByCustomer.get(customerId) || { outstandingPeriod: 0, openCreditOrders: 0 };
      return {
        customerId: c._id || c.id,
        name: c.name,
        phone: c.phone,
        outstandingBalanceTotal: normalizeNumber(c.creditBalance || 0),
        outstandingBalancePeriod: customerCredit.outstandingPeriod,
        openCreditOrders: customerCredit.openCreditOrders
      };
    });

    // totals
    const response = {
      totals: {
        totalSales,
        totalSalesNet,
        totalTax,
        averageOrderValue: ordersCount > 0 ? totalSales / ordersCount : 0,
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
      lowStockProducts,
      productSummaryPagination,
      unsettledCustomers: unsettled,
      recentOrders: limitedRecentOrders
    };

    res.json({
      ...response,
      inventoryValueAtCost,
      inventoryValueAtSellingPrice
    });
  } catch (err) {
    console.error('Error building dashboard summary:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.buildProductSummary = buildProductSummary;
module.exports.getReferenceId = getReferenceId;
