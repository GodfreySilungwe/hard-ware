const test = require('node:test');
const assert = require('node:assert/strict');
const {
  summarizeOrders,
  getPaymentMethodLabel,
  buildPaymentProceeds,
  buildReportSummary
} = require('../lib/orderMetrics');

test('excludes reversed orders from sales and profit totals', () => {
  const summary = summarizeOrders([
    { status: 'completed', totalAmount: 100, profit: 40, items: [{ quantity: 2 }] },
    { status: 'reversed', totalAmount: 250, profit: 90, items: [{ quantity: 5 }] }
  ], { includeReversed: false });

  assert.equal(summary.count, 1);
  assert.equal(summary.totalSales, 100);
  assert.equal(summary.totalProfit, 40);
  assert.equal(summary.totalItems, 2);
});

test('labels Airtel Money and Mpamba payment methods distinctly', () => {
  assert.equal(getPaymentMethodLabel('airtel_money'), 'Airtel Money');
  assert.equal(getPaymentMethodLabel('mpamba'), 'Mpamba');
});

test('calculates total tax and net sales for tax compliant orders', () => {
  const summary = summarizeOrders([
    { status: 'completed', totalAmount: 117.5, taxAmount: 17.5, netAmount: 100, profit: 30, items: [{ quantity: 1 }] },
    { status: 'completed', totalAmount: 100, profit: 20, items: [{ quantity: 2 }] }
  ], { includeReversed: false });

  assert.equal(summary.totalSales, 217.5);
  assert.equal(summary.totalTax, 17.5);
  assert.equal(summary.totalSalesNet, 200);
  assert.equal(summary.totalProfit, 50);
});

test('groups sales totals by payment method', () => {
  const summary = summarizeOrders([
    { status: 'completed', paymentMethod: 'cash', totalAmount: 100, profit: 30 },
    { status: 'completed', paymentMethod: 'card', totalAmount: 200, profit: 40 },
    { status: 'completed', paymentMethod: 'cash', totalAmount: 50, profit: 10 },
    { status: 'reversed', paymentMethod: 'card', totalAmount: 999, profit: 200 }
  ], { includeReversed: false });

  assert.deepEqual(summary.paymentMethods, [
    { method: 'card', label: 'Card', count: 1, amount: 200 },
    { method: 'cash', label: 'Cash', count: 2, amount: 150 }
  ]);
});

test('counts credit-sale payments as cash and orders proceeds without including outstanding credit', () => {
  const paymentProceeds = buildPaymentProceeds([
    { status: 'completed', paymentMethod: 'mpamba', totalAmount: 40 },
    { status: 'completed', paymentMethod: 'credit', totalAmount: 100, paidAmount: 25, dueAmount: 75 },
    { status: 'completed', paymentMethod: 'card', paymentMethodLabel: 'Bank', totalAmount: 60 },
    { status: 'completed', paymentMethod: 'airtel_money', totalAmount: 30 },
    { status: 'completed', paymentMethod: 'cash', totalAmount: 50 },
    { status: 'reversed', paymentMethod: 'cash', totalAmount: 999 }
  ], {
    additionalCreditRepaymentAmount: 15,
    additionalCreditRepaymentCount: 1
  });

  assert.deepEqual(paymentProceeds, [
    { method: 'cash', label: 'Cash', count: 2, amount: 75 },
    { method: 'airtel_money', label: 'Airtel Money', count: 1, amount: 30 },
    { method: 'mpamba', label: 'Mpamba', count: 1, amount: 40 },
    { method: 'card', label: 'Bank', count: 1, amount: 60 },
    { method: 'credit_repayment', label: 'Credit Repayment', count: 1, amount: 15 }
  ]);
});

test('uses saved labels for configured payment methods in summaries', () => {
  const summary = summarizeOrders([
    {
      status: 'completed',
      paymentMethod: 'custom_mobile_wallet',
      paymentMethodLabel: 'Local Wallet',
      totalAmount: 125
    }
  ], { includeReversed: false });

  assert.deepEqual(summary.paymentMethods, [
    { method: 'custom_mobile_wallet', label: 'Local Wallet', count: 1, amount: 125 }
  ]);
});

test('buildReportSummary aggregates top products and payment totals without full order payloads', () => {
  const summary = buildReportSummary([
    {
      status: 'completed',
      createdAt: '2024-01-01T00:00:00.000Z',
      paymentMethod: 'cash',
      customerName: 'Alice',
      profit: 90,
      totalAmount: 300,
      items: [
        { quantity: 2, subtotal: 200, priceAtSale: 100, costPrice: 50, product: { name: 'Hammer', category: { name: 'Tools' } } },
        { quantity: 1, subtotal: 100, priceAtSale: 100, costPrice: 20, product: { name: 'Nails', category: { name: 'Tools' } } }
      ]
    },
    {
      status: 'completed',
      createdAt: '2024-01-02T00:00:00.000Z',
      paymentMethod: 'card',
      customerName: 'Bob',
      profit: 40,
      totalAmount: 150,
      items: [
        { quantity: 1, subtotal: 150, priceAtSale: 150, costPrice: 110, product: { name: 'Hammer', category: { name: 'Tools' } } }
      ]
    },
    {
      status: 'reversed',
      createdAt: '2024-01-03T00:00:00.000Z',
      paymentMethod: 'cash',
      customerName: 'Charlie',
      profit: 100,
      totalAmount: 200,
      items: [{ quantity: 2, subtotal: 200, priceAtSale: 100, costPrice: 50, product: { name: 'Screwdriver', category: { name: 'Tools' } } }]
    }
  ], { includeReversed: false });

  assert.equal(summary.totalSales, 450);
  assert.equal(summary.totalProfit, 130);
  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.topProfitProducts[0].name, 'Hammer');
  assert.equal(summary.topProfitProducts[0].profit, 140);
  assert.equal(summary.paymentMethods[0].method, 'cash');
  assert.equal(summary.paymentMethods[0].amount, 300);
  assert.deepEqual(summary.categorySales[0], { name: 'Tools', revenue: 450 });
});

test('buildReportSummary does not return raw sales payload', () => {
  const summary = buildReportSummary([
    {
      status: 'completed',
      createdAt: '2024-06-01T00:00:00.000Z',
      paymentMethod: 'cash',
      customerName: 'Alice',
      profit: 10,
      totalAmount: 100,
      items: [{ quantity: 1, subtotal: 100, priceAtSale: 100, costPrice: 90, product: { name: 'Widget', category: { name: 'Gadgets' } } }]
    }
  ], { includeReversed: false });

  assert.equal(summary.sales, undefined);
  assert.equal(Object.hasOwn(summary, 'sales'), false);
});

test('dailySales profits sum to totalProfit', () => {
  const orders = [
    { status: 'completed', createdAt: '2024-06-01T10:00:00.000Z', profit: 10, totalAmount: 100, items: [] },
    { status: 'completed', createdAt: '2024-06-01T15:00:00.000Z', profit: 5, totalAmount: 50, items: [] },
    { status: 'completed', createdAt: '2024-06-02T09:00:00.000Z', profit: 20, totalAmount: 200, items: [] }
  ];

  const summary = buildReportSummary(orders, { includeReversed: false });
  const summed = (Array.isArray(summary.dailySales) ? summary.dailySales.reduce((s, d) => s + (d.profit || 0), 0) : 0);
  assert.equal(summed, summary.totalProfit);
});
