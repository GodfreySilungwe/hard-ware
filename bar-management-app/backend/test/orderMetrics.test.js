const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeOrders, getPaymentMethodLabel } = require('../lib/orderMetrics');

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
