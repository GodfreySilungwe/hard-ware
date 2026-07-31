import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTodayOrderSummary } from './orderSummary.js';

test('uses backend totals when the today summary has totals but no orders array', () => {
  const summary = resolveTodayOrderSummary({ totalSales: 250, totalProfit: 75 }, [], new Date('2024-01-01T00:00:00.000Z'));

  assert.equal(summary.totalSales, 250);
  assert.equal(summary.totalProfit, 75);
  assert.equal(summary.count, 0);
  assert.equal(summary.averageOrderValue, 0);
});

test('derives today order count and sales from the full orders list when the summary payload is stale', () => {
  const today = new Date('2024-01-01T12:00:00.000Z');
  const fallbackOrders = [
    { _id: '1', createdAt: '2024-01-01T09:00:00.000Z', totalAmount: 125, profit: 40, taxAmount: 15, status: 'completed' },
    { _id: '2', createdAt: '2024-01-02T09:00:00.000Z', totalAmount: 300, profit: 80, taxAmount: 30, status: 'completed' }
  ];

  const summary = resolveTodayOrderSummary({ count: 99, totalSales: 9999 }, fallbackOrders, today);

  assert.equal(summary.count, 1);
  assert.equal(summary.totalSales, 125);
  assert.equal(summary.totalProfit, 40);
});
